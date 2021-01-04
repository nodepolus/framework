import { ServerLobbyCreatedEvent, ServerLobbyDestroyedEvent, ServerLobbyJoinEvent, ServerLobbyListEvent } from "../api/events/server";
import { PlayerBannedEvent, PlayerKickedEvent, PlayerLeftEvent } from "../api/events/player";
import { DEFAULT_SERVER_ADDRESS, DEFAULT_SERVER_PORT, MaxValue } from "../util/constants";
import { ConnectionClosedEvent, ConnectionOpenedEvent } from "../api/events/connection";
import { PacketDestination, RootPacketType } from "../protocol/packets/types/enums";
import { LobbyCount, LobbyListing } from "../protocol/packets/root/types";
import { DisconnectReasonType, FakeClientId } from "../types/enums";
import { ConnectionInfo, DisconnectReason } from "../types";
import { Connection } from "../protocol/connection";
import { LobbyCode } from "../util/lobbyCode";
import { ServerConfig } from "../api/config";
import { ServerEvents } from "../api/events";
import { InternalLobby } from "../lobby";
import Emittery from "emittery";
import dgram from "dgram";
import {
  BaseRootPacket,
  GetGameListRequestPacket,
  GetGameListResponsePacket,
  HostGameRequestPacket,
  HostGameResponsePacket,
  JoinGameErrorPacket,
  JoinGameRequestPacket,
} from "../protocol/packets/root";

export class Server extends Emittery.Typed<ServerEvents> {
  public readonly startedAt = Date.now();
  public readonly serverSocket: dgram.Socket;
  public readonly connections: Map<string, Connection> = new Map();
  public readonly connectionLobbyMap: Map<string, InternalLobby> = new Map();

  public lobbies: InternalLobby[] = [];
  public lobbyMap: Map<string, InternalLobby> = new Map();

  // Reserve the fake client IDs
  private connectionIndex = Object.keys(FakeClientId).length / 2;

  get address(): string {
    return this.config.serverAddress ?? DEFAULT_SERVER_ADDRESS;
  }

  get port(): number {
    return this.config.serverPort ?? DEFAULT_SERVER_PORT;
  }

  get defaultLobbyAddress(): string {
    return this.config.defaultLobbyAddress ?? this.address;
  }

  get defaultLobbyPort(): number {
    return this.config.defaultLobbyPort ?? this.port;
  }

  constructor(
    public config: ServerConfig = {},
  ) {
    super();

    this.serverSocket = dgram.createSocket("udp4");

    this.serverSocket.on("message", (buf, remoteInfo) => {
      const sender = this.getConnection(ConnectionInfo.fromString(`${remoteInfo.address}:${remoteInfo.port}`));

      sender.emit("message", buf);
    });
  }

  getNextConnectionId(): number {
    if (++this.connectionIndex > MaxValue.UInt32) {
      this.connectionIndex = 1;
    }

    return this.connectionIndex;
  }

  async listen(): Promise<void> {
    return new Promise((resolve, _reject) => {
      this.serverSocket.bind(this.port, this.address, resolve);
    });
  }

  getConnection(connectionInfo: string | ConnectionInfo): Connection {
    let info: ConnectionInfo;
    let identifier: string;

    if (typeof connectionInfo != "string") {
      info = connectionInfo;
      identifier = info.toString();
    } else {
      info = ConnectionInfo.fromString(connectionInfo);
      identifier = connectionInfo;
    }

    let connection = this.connections.get(identifier);

    if (connection) {
      return connection;
    }

    connection = this.initializeConnection(info);

    this.connections.set(identifier, connection);

    return connection;
  }

  private async handleDisconnection(connection: Connection, reason?: DisconnectReason): Promise<void> {
    if (connection.lobby) {
      const player = connection.lobby.findPlayerByConnection(connection);

      if (player) {
        this.emit("player.left", new PlayerLeftEvent(connection.lobby, player));
      }

      connection.lobby.handleDisconnect(connection, reason);
      this.connectionLobbyMap.delete(connection.getConnectionInfo().toString());

      if (connection.lobby.getConnections().length == 0) {
        const event = new ServerLobbyDestroyedEvent(connection.lobby);

        await this.emit("server.lobby.destroyed", event);

        if (event.isCancelled()) {
          return;
        }

        this.lobbies.splice(this.lobbies.indexOf(connection.lobby), 1);
        this.lobbyMap.delete(connection.lobby.getCode());
      }
    }

    this.connections.delete(connection.getConnectionInfo().toString());
  }

  private initializeConnection(connectionInfo: ConnectionInfo): Connection {
    const newConnection = new Connection(connectionInfo, this.serverSocket, PacketDestination.Client);

    newConnection.id = this.getNextConnectionId();

    newConnection.on("packet", async (packet: BaseRootPacket) => this.handlePacket(packet, newConnection));
    newConnection.once("disconnected").then((reason?: DisconnectReason) => {
      this.emit("connection.closed", new ConnectionClosedEvent(newConnection, reason));
      this.handleDisconnection(newConnection, reason);
    });
    newConnection.once("kicked").then(({ isBanned, kickingPlayer, reason }) => {
      if (!newConnection.lobby) {
        return;
      }

      const lobby = newConnection.lobby;
      const player = lobby.findPlayerByConnection(newConnection);

      if (!player) {
        return;
      }

      if (isBanned) {
        this.emit("player.banned", new PlayerBannedEvent(lobby, player, kickingPlayer, reason));
      } else {
        this.emit("player.kicked", new PlayerKickedEvent(lobby, player, kickingPlayer, reason));
      }
    });
    newConnection.once("hello").then(async () => {
      const event = new ConnectionOpenedEvent(newConnection);

      await this.emit("connection.opened", event);

      if (event.isCancelled()) {
        newConnection.disconnect(event.getDisconnectReason());
      }
    });

    return newConnection;
  }

  private async handlePacket(packet: BaseRootPacket, sender: Connection): Promise<void> {
    switch (packet.type) {
      case RootPacketType.HostGame: {
        let lobbyCode = LobbyCode.generate();

        while (this.lobbyMap.has(lobbyCode)) {
          lobbyCode = LobbyCode.generate();
        }

        const newLobby = new InternalLobby(
          this,
          this.defaultLobbyAddress,
          this.defaultLobbyPort,
          (packet as HostGameRequestPacket).options,
          lobbyCode,
        );

        const event = new ServerLobbyCreatedEvent(sender, newLobby);

        await this.emit("server.lobby.created", event);

        if (!event.isCancelled()) {
          this.lobbies.push(newLobby);
          this.lobbyMap.set(newLobby.getCode(), newLobby);

          sender.sendReliable([new HostGameResponsePacket(newLobby.getCode())]);
        } else {
          sender.disconnect(event.getDisconnectReason());
        }
        break;
      }
      case RootPacketType.JoinGame: {
        const lobbyCode = (packet as JoinGameRequestPacket).lobbyCode;
        let lobby = this.lobbyMap.get(lobbyCode);
        const event = new ServerLobbyJoinEvent(sender, lobbyCode, lobby);

        await this.emit("server.lobby.join", event);

        if (!event.isCancelled()) {
          if (event.getLobby()) {
            lobby = event.getLobby() as InternalLobby;

            this.connectionLobbyMap.set(sender.getConnectionInfo().toString(), lobby);
            lobby.handleJoin(sender);
          } else {
            sender.sendReliable([new JoinGameErrorPacket(DisconnectReasonType.GameNotFound)]);
          }
        } else {
          sender.sendReliable([new JoinGameErrorPacket(event.getDisconnectReason())]);
        }
        break;
      }
      case RootPacketType.GetGameList: {
        const results: LobbyListing[] = [];
        const counts = new LobbyCount();

        for (let i = 0; i < this.lobbies.length; i++) {
          const lobby = this.lobbies[i];
          const level: number = lobby.getLevel();

          // TODO: Add config option to include private games
          if (!lobby.isPublic()) {
            continue;
          }

          counts.increment(level);

          const listing = lobby.getLobbyListing();

          // TODO: Add config option for max player count and max results
          if (listing.playerCount < 10 && results.length < 10) {
            results[i] = listing;
          }
        }

        results.sort((a, b) => b.playerCount - a.playerCount);

        const event = new ServerLobbyListEvent(sender, (packet as GetGameListRequestPacket).includePrivate, results, counts);

        await this.emit("server.lobby.list", event);

        if (!event.isCancelled()) {
          sender.sendReliable([new GetGameListResponsePacket(event.getLobbies(), event.getLobbyCounts())]);
        } else {
          sender.disconnect(event.getDisconnectReason());
        }
        break;
      }
      default: {
        const lobby = this.connectionLobbyMap.get(sender.getConnectionInfo().toString());

        if (!lobby) {
          throw new Error(`Client ${sender.id} sent root game packet type ${packet.type} (${RootPacketType[packet.type]}) while not in a lobby`);
        }
      }
    }
  }
}
