import { ConnectionInfo, DisconnectReason, InboundPacketTransformer, LobbyListing, OutboundPacketTransformer } from "../types";
import { CONNECTION_TIMEOUT_DURATION, DEFAULT_CONFIG, MaxValue } from "../util/constants";
import { ConnectionClosedEvent, ConnectionOpenedEvent } from "../api/events/connection";
import { RpcPacket } from "../protocol/packets/gameData";
import { RootPacket } from "../protocol/packets/hazel";
import { PlayerLeftEvent } from "../api/events/player";
import { MessageReader } from "../util/hazelMessage";
import { Connection } from "../protocol/connection";
import { LobbyCode } from "../util/lobbyCode";
import { ServerConfig } from "../api/config";
import { ServerEvents } from "../api/events";
import { LobbyInstance } from "../api/lobby";
import { Logger } from "../logger";
import { Lobby } from "../lobby";
import Emittery from "emittery";
import dgram from "dgram";
import {
  BaseRootPacket,
  GameDataPacket,
  GetGameListRequestPacket,
  GetGameListResponsePacket,
  HostGameRequestPacket,
  HostGameResponsePacket,
  JoinGameErrorPacket,
  JoinGameRequestPacket,
  ReportPlayerRequestPacket,
  ReportPlayerResponsePacket,
} from "../protocol/packets/root";
import {
  ServerLobbyCreatedEvent,
  ServerLobbyCreatedRefusedEvent,
  ServerLobbyCreatingEvent,
  ServerLobbyDestroyedEvent,
  ServerLobbyJoinEvent,
  ServerLobbyListEvent,
  ServerPacketInCustomEvent,
  ServerPacketInEvent,
  ServerPacketOutCustomEvent,
  ServerPacketOutEvent,
  ServerPacketOutGameDataCustomEvent,
  ServerPacketOutGameDataEvent,
  ServerPacketOutRpcCustomEvent,
  ServerPacketOutRpcEvent,
  ServerPlayerReportedEvent,
} from "../api/events/server";
import {
  FakeClientId,
  GameDataPacketType,
  GameState,
  PacketDestination,
  ReportOutcome,
  RootPacketType,
  RpcPacketType,
  Scene,
} from "../types/enums";

export class Server extends Emittery<ServerEvents> {
  protected readonly startedAt = Date.now();
  protected readonly socket = dgram.createSocket("udp4");
  protected readonly logger: Logger;
  protected readonly connections: Map<string, Connection> = new Map();
  protected readonly lobbies: LobbyInstance[] = [];
  protected readonly lobbyMap: Map<string, LobbyInstance> = new Map();

  // Reserve the fake client IDs
  protected connectionIndex = Object.keys(FakeClientId).length / 2;
  protected listening = false;
  protected inboundPacketTransformer?: InboundPacketTransformer;
  protected outboundPacketTransformer?: OutboundPacketTransformer;
  protected connectionFlushInterval?: NodeJS.Timeout;

  /**
   * @param config - The server configuration
   */
  constructor(
    protected readonly config: ServerConfig = {},
  ) {
    super();

    this.logger = new Logger(
      "Server",
      [process.env.NP_LOG_LEVEL, this.config.logging?.level].find(Logger.isValidLevel) ?? DEFAULT_CONFIG.logging.level,
      this.config.logging?.filename ?? DEFAULT_CONFIG.logging.filename,
      this.config.logging?.maxFileSizeInBytes ?? DEFAULT_CONFIG.logging.maxFileSizeInBytes,
      this.config.logging?.maxFiles ?? DEFAULT_CONFIG.logging.maxFiles,
    );

    this.socket.on("message", (buffer, remoteInfo) => {
      if (!this.listening) {
        return;
      }

      const info = ConnectionInfo.fromString(`${remoteInfo.address}:${remoteInfo.port}`);
      const connection = this.getConnection(info);

      if (!this.connections.has(info.toString())) {
        const maxConnectionsPerAddress = this.getMaxConnectionsPerAddress();

        if (maxConnectionsPerAddress > 0) {
          const connections = [...this.connections.values()];
          let count = 0;

          for (let i = 0; i < connections.length; i++) {
            if (connections[i].getConnectionInfo().getAddress() === info.getAddress() &&
                ++count >= maxConnectionsPerAddress
            ) {
              return connection.disconnect(DisconnectReason.custom("Too many active connections from your IP address"));
            }
          }
        }

        this.connections.set(
          info.toString(),
          connection,
        );
      }

      const reader = MessageReader.fromRawBytes(buffer);

      connection.emit(
        "message",
        this.inboundPacketTransformer !== undefined ? this.inboundPacketTransformer(connection, reader) : reader,
      );
    });

    this.socket.on("error", error => {
      this.logger.catch(error);
    });

    if (this.getMaxPlayersPerLobby() > 10) {
      this.logger.warn("Lobbies with more than 10 players is experimental");
    }
  }

  /**
   * Gets the function used to transform incoming packets.
   */
  getInboundPacketTransformer(): InboundPacketTransformer | undefined {
    return this.inboundPacketTransformer;
  }

  /**
   * Sets the function used to transform incoming packets.
   *
   * @param inboundPacketTransformer - The function used to transform incoming packets
   */
  setInboundPacketTransformer(inboundPacketTransformer: InboundPacketTransformer): this {
    this.inboundPacketTransformer = inboundPacketTransformer;

    return this;
  }

  /**
   * Gets the function used to transform outgoing packets.
   */
  getOutboundPacketTransformer(): OutboundPacketTransformer | undefined {
    return this.outboundPacketTransformer;
  }

  /**
   * Sets the function used to transform outgoing packets.
   *
   * @param inboundPacketTransformer - The function used to transform outgoing packets
   */
  setOutboundPacketTransformer(outboundPacketTransformer: OutboundPacketTransformer): this {
    this.outboundPacketTransformer = outboundPacketTransformer;

    return this;
  }

  /**
   * Gets the time (in milliseconds since the Unix epoch) at which the server
   * was started.
   */
  getStartedAt(): number {
    return this.startedAt;
  }

  /**
   * Gets the underlying socket for the server.
   */
  getSocket(): dgram.Socket {
    return this.socket;
  }

  /**
   * Gets the server's logger, or a child logger with the given name.
   *
   * @param childName - The name of the child logger
   * @returns The server's logger, or a child logger using `childName` for the name
   */
  getLogger(childName?: string): Logger {
    return childName === undefined ? this.logger : this.logger.child(childName);
  }

  /**
   * Gets all of the connections connected to the server.
   */
  getConnections(): ReadonlyMap<string, Connection> {
    return this.connections;
  }

  /**
   * Gets or creates a connection from the given ConnectionInfo.
   *
   * @param connectionInfo - The ConnectionInfo describing the connection that will be returned
   * @returns A connection described by `connectionInfo`
   */
  getConnection(connectionInfo: ConnectionInfo): Connection {
    return this.connections.get(connectionInfo.toString()) ?? this.initializeConnection(connectionInfo);
  }

  /**
   * Gets the first Connection whose ID matches the given ID.
   *
   * @param clientId - The ID of the connection
   * @returns The connection, or `undefined` if no connection in the server has the ID `clientId`
   */
  findConnectionById(clientId: number): Connection | undefined {
    for (const [, connection] of this.connections) {
      if (connection.getId() === clientId) {
        return connection;
      }
    }
  }

  /**
   * Gets all lobbies hosted on the server.
   */
  getLobbies(): readonly LobbyInstance[] {
    return this.lobbies;
  }

  /**
   * Gets the lobby with the given code.
   *
   * @param code - The code for the lobby that will be returned
   * @returns The lobby, or `undefined` if no lobbies on the server have the code `code`
   */
  getLobby(code: string): LobbyInstance | undefined {
    return this.lobbyMap.get(code);
  }

  /**
   * Adds the given lobby to the server.
   *
   * @param lobby - The lobby to be added
   */
  addLobby(lobby: LobbyInstance): this {
    if (this.lobbyMap.has(lobby.getCode())) {
      throw new Error(`A lobby with the code ${lobby.getCode()} already exists`);
    }

    this.lobbies.push(lobby);
    this.lobbyMap.set(lobby.getCode(), lobby);

    return this;
  }

  /**
   * Removes the given lobby from the server.
   *
   * @param lobby - The lobby to be removed
   */
  deleteLobby(lobby: LobbyInstance, reason?: DisconnectReason): this {
    lobby.cleanup(reason);
    this.lobbies.splice(this.lobbies.indexOf(lobby), 1);
    this.lobbyMap.delete(lobby.getCode());

    return this;
  }

  /**
   * Gets the server configuration.
   */
  getConfig(): ServerConfig {
    return this.config;
  }

  /**
   * Gets the IP address to which the server is bound.
   */
  getAddress(): string {
    return this.config.serverAddress ?? DEFAULT_CONFIG.serverAddress;
  }

  /**
   * Gets the port on which the server listens for packets.
   */
  getPort(): number {
    return this.config.serverPort ?? DEFAULT_CONFIG.serverPort;
  }

  /**
   * Gets the maximum number of lobbies that the server will host at a time.
   */
  getMaxLobbies(): number {
    return this.config.maxLobbies ?? DEFAULT_CONFIG.maxLobbies;
  }

  /**
   * Gets the maximum number of connections allowed per IP address.
   */
  getMaxConnectionsPerAddress(): number {
    return this.config.maxConnectionsPerAddress ?? DEFAULT_CONFIG.maxConnectionsPerAddress;
  }

  /**
   * Gets the default IP address to which a lobby hosted by the server is bound.
   */
  getDefaultLobbyAddress(): string {
    return this.config.lobby?.defaultAddress ?? DEFAULT_CONFIG.lobby.defaultAddress;
  }

  /**
   * Gets the default port on which a lobby hosted by the server listens for
   * packets.
   */
  getDefaultLobbyPort(): number {
    return this.config.lobby?.defaultPort ?? DEFAULT_CONFIG.lobby.defaultPort;
  }

  /**
   * Gets the default time, in seconds, until the game starts after a host
   * clicks the Play button in a lobby.
   */
  getDefaultLobbyStartTimerDuration(): number {
    return this.config.lobby?.defaultStartTimerDuration ?? DEFAULT_CONFIG.lobby.defaultStartTimerDuration;
  }

  /**
   * Gets the default time, in seconds, before a lobby is automatically closed
   * if no players have joined.
   */
  getDefaultLobbyTimeToJoinUntilClosed(): number {
    return this.config.lobby?.defaultTimeToJoinUntilClosed ?? DEFAULT_CONFIG.lobby.defaultTimeToJoinUntilClosed;
  }

  /**
   * Gets the default time, in seconds, before a lobby is automatically closed
   * if a game has not been started.
   */
  getDefaultLobbyTimeToStartUntilClosed(): number {
    return this.config.lobby?.defaultTimeToStartUntilClosed ?? DEFAULT_CONFIG.lobby.defaultTimeToStartUntilClosed;
  }

  /**
   * Gets the maximum number of players that the server will allow in a lobby.
   */
  getMaxPlayersPerLobby(): number {
    return this.config.lobby?.maxPlayers ?? DEFAULT_CONFIG.lobby.maxPlayers;
  }

  /**
   * Gets whether or not chat packets from dead players should be sent to
   * players that are still alive.
   */
  shouldHideGhostChat(): boolean {
    return this.config.lobby?.hideGhostChat ?? DEFAULT_CONFIG.lobby.hideGhostChat;
  }

  /**
   * Gets the next available client ID.
   */
  getNextConnectionId(): number {
    if (++this.connectionIndex > MaxValue.UInt32) {
      this.connectionIndex = Object.keys(FakeClientId).length / 2;
    }

    return this.connectionIndex;
  }

  /**
   * Starts listening for packets on the server socket.
   */
  async listen(): Promise<void> {
    return new Promise((resolve, _reject) => {
      this.socket.bind(this.getPort(), this.getAddress(), () => {
        this.listening = true;

        this.emit("server.ready");
        this.startConnectionFlushInterval();

        resolve();
      });
    });
  }

  /**
   * Stops listening for packets on the server socket, disconnects all
   * connections, and removes all lobbies.
   */
  async close(): Promise<void> {
    this.listening = false;

    this.stopConnectionFlushInterval();

    const disconnectReason = DisconnectReason.custom("The server is shutting down");

    for (let i = 0; i < this.lobbies.length; i++) {
      await this.lobbies[i].close(disconnectReason, true);
    }

    const connections = [...this.connections.values()];

    for (let i = 0; i < connections.length; i++) {
      connections[i].disconnect(disconnectReason, true);
    }

    this.lobbies.splice(0, this.lobbies.length);
    this.lobbyMap.clear();

    await this.emit("server.close");
  }

  protected startConnectionFlushInterval(): void {
    if (this.connectionFlushInterval !== undefined) {
      return;
    }

    this.connectionFlushInterval = setInterval(() => {
      const connections = [...this.connections.values()];

      for (let i = 0; i < connections.length; i++) {
        const connection = connections[i];

        if (connection.hasTimedOut()) {
          connection.disconnect(DisconnectReason.custom(`Did not receive any pings for ${CONNECTION_TIMEOUT_DURATION}ms`), true);

          return;
        }

        connection.safeFlushReliable();
        connection.safeFlushUnreliable();
      }
    }, 50);
  }

  protected stopConnectionFlushInterval(): void {
    if (this.connectionFlushInterval === undefined) {
      return;
    }

    clearInterval(this.connectionFlushInterval);
    delete this.connectionFlushInterval;
  }

  /**
   * Cleans up the given disconnecting connection and removes empty lobbies.
   *
   * @param connection - The connection that was disconnected
   * @param reason - The reason for why the connection was disconnected
   */
  protected async handleDisconnect(connection: Connection, reason?: DisconnectReason): Promise<void> {
    const lobby = connection.getLobby();

    if (lobby !== undefined) {
      this.getLogger().verbose("Connection %s disconnected from lobby %s", connection, lobby);

      const player = lobby.findPlayerByConnection(connection);

      await lobby.handleDisconnect(connection, reason);

      if (player !== undefined) {
        await this.emit("player.left", new PlayerLeftEvent(lobby, player));
      }

      if (lobby.getConnections().length == 0) {
        this.getLogger().verbose("Destroying lobby %s", lobby);

        const event = new ServerLobbyDestroyedEvent(lobby);

        await this.emit("server.lobby.destroyed", event);

        if (event.isCancelled()) {
          this.getLogger().verbose("Cancelled destroying lobby %s", lobby);

          return;
        }

        this.getLogger().verbose("Destroyed lobby %s", lobby);

        this.deleteLobby(lobby);
      }
    } else {
      this.getLogger().verbose("Connection %s disconnected", connection);
    }

    this.connections.delete(connection.getConnectionInfo().toString());
  }

  /**
   * Emits events for RPC packets and all other GameData packets.
   *
   * @param connection - The connection to which the packet was sent
   * @param event - The event containing the root packet which may or may not have a GameData packet
   */
  protected async emitGameDataEvents(connection: Connection, event: ServerPacketOutEvent | ServerPacketOutCustomEvent): Promise<void> {
    if (event.isCancelled()) {
      return;
    }

    const gameDataListeners = this.listenerCount("server.packet.out.gamedata");
    const gameDataCustomListeners = this.listenerCount("server.packet.out.gamedata.custom");

    if (event.getPacket().getType() !== RootPacketType.GameData && event.getPacket().getType() !== RootPacketType.GameDataTo) {
      return;
    }

    const subpackets = (event.getPacket() as GameDataPacket).packets;
    const filteredIndices: number[] = [];

    for (let i = 0; i < subpackets.length; i++) {
      const subpacket = subpackets[i];

      // Emit events for RPC packets
      if (subpacket.getType() === GameDataPacketType.RPC) {
        const rpc = subpacket as RpcPacket;
        const rpcListeners = this.listenerCount("server.packet.out.rpc");
        const rpcCustomListeners = this.listenerCount("server.packet.out.rpc.custom");

        // Emit events for base RPC packets
        if (rpc.packet.getType() in RpcPacketType) {
          if (rpcListeners > 0) {
            const rpcEvent = new ServerPacketOutRpcEvent(connection, rpc.senderNetId, rpc.packet);

            await this.emit("server.packet.out.rpc", rpcEvent);

            if (rpcEvent.isCancelled()) {
              filteredIndices.push(i);
            }
          }
        // Emit events for custom RPC packets
        } else if (rpcCustomListeners > 0) {
          const rpcEvent = new ServerPacketOutRpcCustomEvent(connection, rpc.senderNetId, rpc.packet);

          await this.emit("server.packet.out.rpc.custom", rpcEvent);

          if (rpcEvent.isCancelled()) {
            filteredIndices.push(i);
          }
        }
      // Emit events for base GameData packets, excluding RPC as that is handled above
      } else if (subpacket.getType() in GameDataPacketType) {
        if (gameDataListeners > 0) {
          const gameDataEvent = new ServerPacketOutGameDataEvent(connection, subpacket);

          await this.emit("server.packet.out.gamedata", gameDataEvent);

          if (gameDataEvent.isCancelled()) {
            filteredIndices.push(i);
          }
        }
      // Emit events for custom GameData packets
      } else if (gameDataCustomListeners > 0) {
        const gameDataEvent = new ServerPacketOutGameDataCustomEvent(connection, subpacket);

        await this.emit("server.packet.out.gamedata.custom", gameDataEvent);

        if (gameDataEvent.isCancelled()) {
          filteredIndices.push(i);
        }
      }
    }

    for (let i = filteredIndices.length - 1; i >= 0; i--) {
      subpackets.splice(filteredIndices[i], 1);
    }
  }

  /**
   * Creates a new connection from the given ConnectionInfo.
   *
   * @param connectionInfo - The ConnectionInfo describing the connection
   * @returns A new connection described by `connectionInfo`
   */
  protected initializeConnection(connectionInfo: ConnectionInfo): Connection {
    const connection = new Connection(
      connectionInfo,
      this.socket,
      PacketDestination.Client,
      (): OutboundPacketTransformer | undefined => this.getOutboundPacketTransformer(),
    );

    connection.setId(this.getNextConnectionId());

    this.getLogger().verbose("Initialized connection %s", connection);

    connection.on("packet", (packet: BaseRootPacket) => {
      this.handlePacket(packet, connection);
    });

    if (this.listenerCount("server.packet.out.custom") > 0) {
      connection.on("writeCustom", async event => {
        await this.emit("server.packet.out.custom", event);
      });
    }

    if (this.listenerCount("server.packet.out") > 0) {
      connection.on("write", async event => {
        await this.emit("server.packet.out", event);
      });
    }

    const gameDataCount = this.listenerCount("server.packet.out.gamedata.custom")
                        + this.listenerCount("server.packet.out.gamedata")
                        + this.listenerCount("server.packet.out.rpc.custom")
                        + this.listenerCount("server.packet.out.rpc");

    if (gameDataCount > 0) {
      connection.on("writeCustom", async event => {
        await this.emitGameDataEvents(connection, event);
      });
      connection.on("write", async event => {
        await this.emitGameDataEvents(connection, event);
      });
    }

    connection.once("disconnected").then((reason?: DisconnectReason) => {
      this.emit("connection.closed", new ConnectionClosedEvent(connection, reason));
      this.handleDisconnect(connection, reason);
    });

    connection.once("hello").then(async () => {
      const event = new ConnectionOpenedEvent(connection);

      await this.emit("connection.opened", event);

      if (event.isCancelled()) {
        connection.disconnect(event.getDisconnectReason());
      }
    });

    return connection;
  }

  /**
   * Called when the server receives a packet from a connection.
   *
   * @param packet - The packet that was sent to the server
   * @param connection - The connection that sent the packet
   */
  protected async handlePacket(packet: BaseRootPacket, connection: Connection): Promise<void> {
    if (packet.getType() in RootPacketType) {
      if (this.listenerCount("server.packet.in") > 0) {
        const event = new ServerPacketInEvent(connection, packet);

        await this.emit("server.packet.in", event);

        if (event.isCancelled()) {
          return;
        }
      }
    } else {
      const custom = RootPacket.getPacket(packet.getType());

      if (custom !== undefined) {
        if (this.listenerCount("server.packet.in.custom") > 0) {
          const event = new ServerPacketInCustomEvent(connection, packet);

          await this.emit("server.packet.in.custom", event);

          if (event.isCancelled()) {
            return;
          }
        }

        custom.handle(connection, packet);

        return;
      }
    }

    switch (packet.getType()) {
      case RootPacketType.HostGame: {
        if (connection.getLobby() !== undefined) {
          return;
        }

        this.getLogger().verbose("Connection %s trying to host lobby", connection);

        if (this.getMaxLobbies() > 0 && this.lobbies.length >= this.getMaxLobbies()) {
          const refusedEvent = new ServerLobbyCreatedRefusedEvent(connection);

          await this.emit("server.lobby.created.refused", refusedEvent);

          if (!refusedEvent.isCancelled()) {
            this.getLogger().verbose("Preventing connection %s from hosting lobby on full server", connection);

            connection.writeReliable(new JoinGameErrorPacket(refusedEvent.getDisconnectReason()));

            return;
          }

          this.getLogger().verbose("Allowing connection %s to host lobby on full server", connection);
        }

        let lobbyCode = LobbyCode.generate();

        while (this.lobbyMap.has(lobbyCode)) {
          lobbyCode = LobbyCode.generate();
        }

        const creatingEvent = new ServerLobbyCreatingEvent(connection, lobbyCode, (packet as HostGameRequestPacket).options);

        await this.emit("server.lobby.creating", creatingEvent);

        if (creatingEvent.isCancelled()) {
          this.getLogger().verbose("Prevented connection %s from hosting lobby", connection);

          connection.disconnect(creatingEvent.getDisconnectReason());

          return;
        }

        const newLobby = new Lobby(
          this,
          this.getDefaultLobbyAddress(),
          this.getDefaultLobbyPort(),
          this.getDefaultLobbyStartTimerDuration(),
          this.getDefaultLobbyTimeToJoinUntilClosed(),
          this.getDefaultLobbyTimeToStartUntilClosed(),
          this.shouldHideGhostChat(),
          creatingEvent.getOptions(),
          creatingEvent.getLobbyCode(),
        );
        const createdEvent = new ServerLobbyCreatedEvent(connection, newLobby);

        await this.emit("server.lobby.created", createdEvent);

        if (!createdEvent.isCancelled()) {
          this.getLogger().verbose("Connection %s hosting lobby %s", connection, newLobby);

          this.addLobby(newLobby);

          connection.sendReliable([new HostGameResponsePacket(newLobby.getCode())]);
        } else {
          this.getLogger().verbose("Prevented connection %s from hosting lobby %s", connection, newLobby);

          connection.disconnect(createdEvent.getDisconnectReason());
        }
        break;
      }
      case RootPacketType.JoinGame: {
        if (connection.getLobby() !== undefined && connection.getCurrentScene() !== Scene.EndGame) {
          return;
        }

        const lobbyCode = (packet as JoinGameRequestPacket).lobbyCode;
        const event = new ServerLobbyJoinEvent(connection, lobbyCode, this.lobbyMap.get(lobbyCode));

        await this.emit("server.lobby.join", event);

        if (!event.isCancelled()) {
          const lobby = event.getLobby();

          if (lobby !== undefined) {
            const code = lobby.getCode();

            if (lobbyCode !== code) {
              connection.sendReliable([new HostGameResponsePacket(code)]);
            }

            (lobby as Lobby).handleJoin(connection);
          } else {
            connection.sendReliable([new JoinGameErrorPacket(DisconnectReason.gameNotFound())]);
          }
        } else {
          connection.sendReliable([new JoinGameErrorPacket(event.getDisconnectReason())]);
        }
        break;
      }
      case RootPacketType.GameData:
        // fallthrough
      case RootPacketType.GameDataTo:
        break;
      case RootPacketType.GetGameList: {
        if (connection.getLobby() !== undefined) {
          return;
        }

        connection.setCurrentScene(Scene.FindAGame);

        const request = packet as GetGameListRequestPacket;
        const levels = request.options.getLevels();
        const languages = request.options.getLanguages();
        const results: LobbyListing[] = [];

        for (let i = 0; i < this.lobbies.length; i++) {
          const lobby = this.lobbies[i];

          if (lobby.getGameState() !== GameState.NotStarted) {
            continue;
          }

          if (!lobby.isPublic()) {
            continue;
          }

          if (!levels.includes(lobby.getLevel())) {
            continue;
          }

          // TODO: Intersect so lobbies can have multiple languages
          if (!languages.includes(lobby.getOptions().getLanguages()[0])) {
            continue;
          }

          const listing = lobby.getLobbyListing();

          if (!listing.isFull() && results.length < 10) {
            results.push(listing);
          }
        }

        results.sort((a, b) => b.getPlayerCount() - a.getPlayerCount());

        const event = new ServerLobbyListEvent(connection, results);

        await this.emit("server.lobby.list", event);

        if (!event.isCancelled()) {
          this.getLogger().verbose("Sending game list to connection %s", connection);

          connection.sendReliable([new GetGameListResponsePacket(event.getLobbies())]);
        } else {
          connection.disconnect(event.getDisconnectReason());
        }
        break;
      }
      case RootPacketType.ReportPlayer: {
        const request = packet as ReportPlayerRequestPacket;
        const lobby = connection.getLobby();

        if (lobby === undefined || lobby.getCode() !== request.lobbyCode) {
          return;
        }

        const sender = connection.getPlayer();
        const target = lobby.findPlayerByClientId(request.reportedClientId);

        if (sender === undefined || target === undefined) {
          return;
        }

        const event = new ServerPlayerReportedEvent(lobby, target, sender, request.reportReason);

        await this.emit("server.player.reported", event);

        if (event.isCancelled()) {
          event.setReportOutcome(ReportOutcome.NotReportedUnknown);
        }

        connection.sendReliable([new ReportPlayerResponsePacket(
          request.reportedClientId,
          request.reportReason,
          event.getReportOutcome(),
          target.getName().toString(),
        )]);
        break;
      }
      default: {
        if (connection.getLobby() === undefined) {
          throw new Error(`Client ${connection.getId()} sent root game packet type ${packet.getType()} (${RootPacketType[packet.getType()]}) while not in a lobby`);
        }
      }
    }
  }
}
