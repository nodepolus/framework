import { BaseInnerNetEntity, BaseInnerNetObject } from "../protocol/entities/baseEntity";
import { EntityPlayer, InnerCustomNetworkTransform } from "../protocol/entities/player";
import { LobbyHostMigratedEvent, LobbyPrivacyUpdatedEvent } from "../api/events/lobby";
import { BaseEntityShipStatus } from "../protocol/entities/shipStatus/baseShipStatus";
import { DisconnectReason, GameOptionsData, LobbyListing, Vector2 } from "../types";
import { EntityLobbyBehaviour } from "../protocol/entities/lobbyBehaviour";
import { BaseRpcPacket, SendChatPacket } from "../protocol/packets/rpc";
import { MessageReader, MessageWriter } from "../util/hazelMessage";
import { EntityMeetingHud } from "../protocol/entities/meetingHud";
import { PlayerData } from "../protocol/entities/gameData/types";
import { EntityGameData } from "../protocol/entities/gameData";
import { PlayerJoinedEvent } from "../api/events/player";
import { RootPacket } from "../protocol/packets/hazel";
import { Connection } from "../protocol/connection";
import { notUndefined } from "../util/functions";
import { PlayerInstance } from "../api/player";
import { LobbyCode } from "../util/lobbyCode";
import { MaxValue } from "../util/constants";
import { LobbyInstance } from "../api/lobby";
import { TextComponent } from "../api/text";
import { HostInstance } from "../api/host";
import { Game } from "../api/game";
import { Logger } from "../logger";
import { Player } from "../player";
import { Server } from "../server";
import { Host } from "../host";
import {
  BaseGameDataPacket,
  ClientInfoPacket,
  DataPacket,
  DespawnPacket,
  RpcPacket,
  SceneChangePacket,
} from "../protocol/packets/gameData";
import {
  BaseRootPacket,
  AlterGameTagPacket,
  GameDataPacket,
  JoinGameErrorPacket,
  JoinGameResponsePacket,
  JoinedGamePacket,
  KickPlayerPacket,
  RemovePlayerPacket,
} from "../protocol/packets/root";
import {
  ServerLobbyDestroyedEvent,
  ServerLobbyJoinRefusedEvent,
  ServerPacketInGameDataCustomEvent,
  ServerPacketInGameDataEvent,
  ServerPacketInRpcCustomEvent,
  ServerPacketInRpcEvent,
} from "../api/events/server";
import {
  AlterGameTag,
  FakeClientId,
  GameDataPacketType,
  GameState,
  InnerNetObjectType,
  Level,
  LimboState,
  PlayerColor,
  PlayerHat,
  PlayerPet,
  PlayerSkin,
  RootPacketType,
  RpcPacketType,
  Scene,
  SpawnFlag,
  SpawnType,
  VoteStateConstants,
} from "../types/enums";

export class Lobby implements LobbyInstance {
  protected readonly createdAt: number = Date.now();
  protected readonly hostInstance: HostInstance = new Host(this);
  protected readonly spawningPlayers: Set<Connection> = new Set();
  protected readonly connections: Connection[] = [];
  protected readonly gameTags: Map<AlterGameTag, number> = new Map([[AlterGameTag.ChangePrivacy, 0]]);
  protected readonly metadata: Map<string, unknown> = new Map();
  protected readonly logger: Logger;
  protected readonly ignoredNetIds: number[] = [];
  protected readonly customEntities: Set<BaseInnerNetEntity> = new Set();

  protected joinTimer?: NodeJS.Timeout;
  protected startTimer?: NodeJS.Timeout;
  protected game?: Game;
  protected players: Player[] = [];
  protected gameState = GameState.NotStarted;
  protected gameData?: EntityGameData;
  protected lobbyBehaviour?: EntityLobbyBehaviour;
  protected shipStatus?: BaseEntityShipStatus;
  protected meetingHud?: EntityMeetingHud;

  constructor(
    protected readonly server: Server,
    protected readonly address: string = server.getDefaultLobbyAddress(),
    protected readonly port: number = server.getDefaultLobbyPort(),
    protected readonly startTimerDuration: number = server.getDefaultLobbyStartTimerDuration(),
    protected readonly timeToJoinUntilClosed: number = server.getDefaultLobbyTimeToJoinUntilClosed(),
    protected readonly timeToStartUntilClosed: number = server.getDefaultLobbyTimeToStartUntilClosed(),
    protected readonly hideGhostChat: boolean = server.shouldHideGhostChat(),
    protected options: GameOptionsData = new GameOptionsData(),
    protected readonly code: string = LobbyCode.generate(),
  ) {
    // if (this.timeToJoinUntilClosed > 0) {
    //   this.joinTimer = setTimeout(() => {
    //     this.close();
    //   }, this.timeToJoinUntilClosed * 1000);
    // }

    this.logger = this.server.getLogger(`Lobby ${this.code}`);
  }

  getLogger(): Logger {
    return this.logger;
  }

  getServer(): Server {
    return this.server;
  }

  getAddress(): string {
    return this.address;
  }

  getPort(): number {
    return this.port;
  }

  getStartTimerDuration(): number {
    return this.startTimerDuration;
  }

  shouldHideGhostChat(): boolean {
    return this.hideGhostChat;
  }

  getCode(): string {
    return this.code;
  }

  getHostName(): string {
    return this.getActingHosts().find(host => host.getName())?.getName()
      ?? this.connections.find(connection => connection.getName())?.getName()
      ?? this.code;
  }

  isPublic(): boolean {
    return !!(this.getGameTag(AlterGameTag.ChangePrivacy) ?? 0);
  }

  isFull(): boolean {
    return this.connections.length >= this.options.getMaxPlayers();
  }

  getLobbyListing(): LobbyListing {
    return new LobbyListing(
      this.address,
      this.port,
      this.code,
      this.getHostName().substring(0, 12),
      this.connections.length,
      this.getAge(),
      this.options.getLevels()[0],
      this.options.getImpostorCount(),
      this.options.getMaxPlayers(),
    );
  }

  getGame(): Game | undefined {
    return this.game;
  }

  getSafeGame(): Game {
    if (this.game === undefined) {
      throw new Error("Lobby does not have a Game instance");
    }

    return this.game;
  }

  /**
   * @internal
   */
  setGame(game?: Game): this {
    this.game = game;

    return this;
  }

  getCreationTime(): number {
    return this.createdAt;
  }

  getAge(): number {
    return (new Date().getTime() - this.createdAt) / 1000;
  }

  async cleanup(reason?: DisconnectReason): Promise<void> {
    this.cancelJoinTimer();
    this.cancelStartTimer();
    this.hostInstance.clearTimers();

    const connections = [...this.connections];
    const promiseArray: Promise<void>[] = [];

    for (let i = 0; i < this.connections.length; i++) {
      promiseArray.push(
        connections[i].disconnect(
          reason ?? DisconnectReason.custom("The lobby was closed by the server"),
          true,
        ),
      );
    }

    await Promise.allSettled(promiseArray);
  }

  async close(reason?: DisconnectReason, force: boolean = false): Promise<void> {
    if (this.server.listenerCount("server.lobby.destroyed") > 0) {
      const event = new ServerLobbyDestroyedEvent(this);

      await this.server.emit("server.lobby.destroyed", event);

      if (!force && event.isCancelled()) {
        return;
      }
    }

    this.server.deleteLobby(this, reason);
  }

  hasMeta(key: string): boolean {
    return this.metadata.has(key);
  }

  getMeta(): Map<string, unknown>;
  getMeta<T = unknown>(key: string): T;
  getMeta<T = unknown>(key?: string): Map<string, unknown> | T {
    return key === undefined ? this.metadata : this.metadata.get(key) as T;
  }

  setMeta(pair: Record<string, unknown>): void;
  setMeta(key: string, value: unknown): void;
  setMeta(key: string | Record<string, unknown>, value?: unknown): void {
    if (typeof key === "string") {
      this.metadata.set(key, value);
    } else {
      for (const [k, v] of Object.entries(key)) {
        this.metadata.set(k, v);
      }
    }
  }

  deleteMeta(key: string): void {
    this.metadata.delete(key);
  }

  clearMeta(): void {
    this.metadata.clear();
  }

  getHostInstance(): HostInstance {
    return this.hostInstance;
  }

  getConnections(): Connection[] {
    return this.connections;
  }

  addConnection(connection: Connection): void {
    this.connections.push(connection);
  }

  removeConnection(connection: Connection): void {
    this.connections.splice(this.connections.indexOf(connection), 1);
  }

  getPlayers(): Player[] {
    return this.players;
  }

  getRealPlayers(): Player[] {
    const realPlayers: Player[] = [];

    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];

      if (player.getConnection() === undefined) {
        continue;
      }

      realPlayers.push(player);
    }

    return realPlayers;
  }

  addPlayer(player: Player): void {
    this.players.push(player);
  }

  clearPlayers(): void {
    this.players = [];
  }

  removePlayer(player: Player): void {
    this.players.splice(this.players.indexOf(player), 1);
    this.gameData?.getGameData().removePlayer(player.getId());
  }

  removeCustomEntity(entity: BaseInnerNetEntity): void {
    this.customEntities.delete(entity);
  }

  findInnerNetObject(netId: number): BaseInnerNetObject | undefined {
    switch (netId) {
      case this.lobbyBehaviour?.getLobbyBehaviour().getNetId():
        return this.lobbyBehaviour!.getLobbyBehaviour();
      case this.gameData?.getGameData().getNetId():
        return this.gameData!.getGameData();
      case this.gameData?.getVoteBanSystem().getNetId():
        return this.gameData!.getVoteBanSystem();
      case this.shipStatus?.getShipStatus().getNetId():
        return this.shipStatus!.getShipStatus();
      case this.meetingHud?.getMeetingHud().getNetId():
        return this.meetingHud!.getMeetingHud();
    }

    for (let i = 0; i < this.players.length; i++) {
      const objects = this.players[i].getEntity().getObjects();

      for (let j = 0; j < objects.length; j++) {
        const object = objects[j];

        if (notUndefined(object) && object.getNetId() == netId) {
          return object;
        }
      }
    }

    for (const entity of this.customEntities) {
      const objects = entity.getObjects();

      for (let j = 0; j < objects.length; j++) {
        const object = objects[j];

        if (notUndefined(object) && object.getNetId() == netId) {
          return object;
        }
      }
    }
  }

  findSafeInnerNetObject(netId: number): BaseInnerNetObject {
    const object = this.findInnerNetObject(netId);

    if (object === undefined) {
      throw new Error(`Lobby does not have an InnerNetObject with the ID ${netId}`);
    }

    return object;
  }

  findPlayerByClientId(clientId: number): Player | undefined {
    return this.players.find(player => player.getEntity().getOwnerId() == clientId);
  }

  findSafePlayerByClientId(clientId: number): Player {
    const player = this.findPlayerByClientId(clientId);

    if (player === undefined) {
      throw new Error(`Lobby does not have a player with the client ID ${clientId}`);
    }

    return player;
  }

  findPlayerByPlayerId(playerId: number): Player | undefined {
    return this.players.find(player => player.getId() == playerId);
  }

  findSafePlayerByPlayerId(playerId: number): Player {
    const player = this.findPlayerByPlayerId(playerId);

    if (player === undefined) {
      throw new Error(`Lobby does not have a player with the player ID ${playerId}`);
    }

    return player;
  }

  findPlayerByNetId(netId: number): Player | undefined {
    return this.players.find(player => player.getEntity().getObjects().some(object => object.getNetId() == netId));
  }

  findSafePlayerByNetId(netId: number): Player {
    const player = this.findPlayerByNetId(netId);

    if (player === undefined) {
      throw new Error(`Lobby does not have a player with the net ID ${netId}`);
    }

    return player;
  }

  findPlayerByConnection(connection: Connection): Player | undefined {
    return this.players.find(player => player.getEntity().getOwnerId() == connection.getId());
  }

  findSafePlayerByConnection(connection: Connection): Player {
    const player = this.findPlayerByConnection(connection);

    if (player === undefined) {
      throw new Error(`Lobby does not have a player for connection ${connection.getId()}`);
    }

    return player;
  }

  findPlayerByEntity(entity: EntityPlayer): Player | undefined {
    return this.players.find(player => player.getEntity().getOwnerId() == entity.getOwnerId());
  }

  findSafePlayerByEntity(entity: EntityPlayer): Player {
    const player = this.findPlayerByEntity(entity);

    if (player === undefined) {
      throw new Error(`Lobby does not have a player for entity ${entity.getOwnerId()}`);
    }

    return player;
  }

  findPlayerIndexByConnection(connection: Connection): number {
    return this.players.findIndex(player => player.getEntity().getOwnerId() == connection.getId());
  }

  findSafePlayerIndexByConnection(connection: Connection): number {
    const index = this.findPlayerIndexByConnection(connection);

    if (index === -1) {
      throw new Error(`Lobby does not have a player for connection ${connection.getId()}`);
    }

    return index;
  }

  findConnection(clientId: number): Connection | undefined {
    return this.connections.find(con => con.getId() == clientId);
  }

  findSafeConnection(clientId: number): Connection {
    const connection = this.findConnection(clientId);

    if (connection === undefined) {
      throw new Error(`Lobby does not have a connection with the ID ${clientId}`);
    }

    return connection;
  }

  getGameData(): EntityGameData | undefined {
    return this.gameData;
  }

  getSafeGameData(): EntityGameData {
    if (this.gameData === undefined) {
      throw new Error("Lobby does not have a GameData instance");
    }

    return this.gameData;
  }

  setGameData(gameData: EntityGameData): void {
    this.gameData = gameData;
  }

  deleteGameData(): void {
    delete this.gameData;
  }

  getLobbyBehaviour(): EntityLobbyBehaviour | undefined {
    return this.lobbyBehaviour;
  }

  getSafeLobbyBehaviour(): EntityLobbyBehaviour {
    if (this.lobbyBehaviour === undefined) {
      throw new Error("Lobby does not have a LobbyBehaviour instance");
    }

    return this.lobbyBehaviour;
  }

  setLobbyBehaviour(lobbyBehaviour: EntityLobbyBehaviour): void {
    this.lobbyBehaviour = lobbyBehaviour;
  }

  deleteLobbyBehaviour(): void {
    delete this.lobbyBehaviour;
  }

  getShipStatus(): BaseEntityShipStatus | undefined {
    return this.shipStatus;
  }

  getSafeShipStatus(): BaseEntityShipStatus {
    if (this.shipStatus === undefined) {
      throw new Error("Lobby does not have a ShipStatus instance");
    }

    return this.shipStatus;
  }

  setShipStatus(shipStatus: BaseEntityShipStatus): void {
    this.shipStatus = shipStatus;
  }

  deleteShipStatus(): void {
    delete this.shipStatus;
  }

  getMeetingHud(): EntityMeetingHud | undefined {
    return this.meetingHud;
  }

  getSafeMeetingHud(): EntityMeetingHud {
    if (this.meetingHud === undefined) {
      throw new Error("Lobby does not have a MeetingHud instance");
    }

    return this.meetingHud;
  }

  setMeetingHud(meetingHud: EntityMeetingHud): void {
    this.meetingHud = meetingHud;
  }

  deleteMeetingHud(): void {
    delete this.meetingHud;
  }

  getOptions(): GameOptionsData {
    return this.options;
  }

  /**
   * Sets the lobby's raw settings.
   *
   * @internal
   * @param options - The lobby's new raw settings
   */
  setOptions(options: GameOptionsData): void {
    this.options = options;
  }

  getLevel(): Level {
    return this.options.getLevels()[0];
  }

  getGameTags(): Map<AlterGameTag, number> {
    return this.gameTags;
  }

  getGameTag(gameTag: AlterGameTag): number | undefined {
    return this.gameTags.get(gameTag);
  }

  async setGameTag(gameTag: AlterGameTag, value: number): Promise<void> {
    switch (gameTag) {
      case AlterGameTag.ChangePrivacy: {
        const event = new LobbyPrivacyUpdatedEvent(this, !!value);

        await this.server.emit("lobby.privacy.updated", event);

        if (event.isCancelled()) {
          return;
        }

        value = event.isPublic() ? 1 : 0;
        break;
      }
    }

    this.gameTags.set(gameTag, value);
    await this.sendRootGamePacket(new AlterGameTagPacket(this.code, gameTag, value));
  }

  getGameState(): GameState {
    return this.gameState;
  }

  setGameState(gameState: GameState): void {
    this.gameState = gameState;
  }

  async sendRootGamePacket(packet: BaseRootPacket, sendTo?: Connection[]): Promise<PromiseSettledResult<void>[]> {
    if (sendTo === undefined) {
      sendTo = this.connections;
    }

    const promiseArray: Promise<void>[] = [];

    for (let i = 0; i < sendTo.length; i++) {
      promiseArray.push(sendTo[i].writeReliable(packet));
    }

    return Promise.allSettled(promiseArray);
  }

  async sendRpcPacket(from: BaseInnerNetObject, packet: BaseRpcPacket, sendTo?: Connection[]): Promise<void> {
    await this.sendRootGamePacket(new GameDataPacket([new RpcPacket(from.getNetId(), packet)], this.code), sendTo);
  }

  async spawn(entity: BaseInnerNetEntity, sendTo?: Connection[]): Promise<void> {
    const type = entity.getType();

    switch (type) {
      case SpawnType.SkeldShipStatus:
      case SpawnType.DleksShipStatus:
      case SpawnType.MiraShipStatus:
      case SpawnType.PolusShipStatus:
      case SpawnType.AirshipStatus:
        this.shipStatus = entity as BaseEntityShipStatus;
        break;
      case SpawnType.GameData:
        this.gameData = entity as EntityGameData;
        break;
      case SpawnType.MeetingHud:
        this.meetingHud = entity as EntityMeetingHud;
        break;
      case SpawnType.LobbyBehaviour:
        this.lobbyBehaviour = entity as EntityLobbyBehaviour;
        break;
      case SpawnType.PlayerControl:
        this.logger.warn("Use LobbyInstance#spawnPlayer() to spawn a player");

        return;
      default:
        this.customEntities.add(entity);
    }

    await this.sendRootGamePacket(new GameDataPacket([entity.serializeSpawn()], this.code), sendTo);
  }

  async spawnPlayer(player: EntityPlayer, playerData: PlayerData): Promise<PlayerInstance> {
    if (player.getPlayerControl().getPlayerId() != playerData.getId()) {
      throw new Error(`Attempted to spawn a player with mismatched player IDs: PlayerControl(${player.getPlayerControl().getPlayerId()}) != PlayerData(${playerData.getId()})`);
    }

    const playerInstance = new Player(this, player, this.findConnection(player.getOwnerId()));

    this.addPlayer(playerInstance);

    if (this.findPlayerByClientId(player.getOwnerId()) === undefined) {
      await this.sendRootGamePacket(new JoinGameResponsePacket(this.code, player.getOwnerId(), this.hostInstance.getId()));
    }

    await this.sendRootGamePacket(new GameDataPacket([player.serializeSpawn()], this.code), this.getConnections());

    if (this.gameData !== undefined) {
      await this.gameData.getGameData().updateGameData([playerData]);
    }

    return playerInstance;
  }

  async despawn(innerNetObject: BaseInnerNetObject, sendTo?: Connection[]): Promise<void> {
    if (innerNetObject.getParent().getLobby().getCode() != this.code) {
      throw new Error(`Attempted to despawn an InnerNetObject from a lobby other than its own`);
    }

    await this.sendRootGamePacket(new GameDataPacket([new DespawnPacket(innerNetObject.getNetId())], this.code), sendTo);
  }

  getActingHosts(): Connection[] {
    return this.connections.filter(con => con.isActingHost());
  }

  async sendChat(name: string, color: PlayerColor, message: string | TextComponent, onLeft: boolean): Promise<void> {
    if (this.gameData === undefined) {
      throw new Error("sendChat called without a GameData instance");
    }

    if (onLeft) {
      const playerId = this.hostInstance.getNextPlayerId();
      const fakePlayer = new EntityPlayer(
        this,
        FakeClientId.ServerChat,
        Vector2.zero(),
        Vector2.zero(),
        playerId,
        false,
        SpawnFlag.None,
      );

      await this.spawnPlayer(fakePlayer, new PlayerData(
        playerId,
        name,
        color,
        PlayerHat.None,
        PlayerPet.None,
        PlayerSkin.None,
        false,
        false,
        false,
        [],
      ));

      await this.sendRpcPacket(fakePlayer.getPlayerControl(), new SendChatPacket(message.toString()));
      fakePlayer.despawn();
    } else {
      for (let i = 0; i < this.players.length; i++) {
        const player = this.players[i];
        const connection = player.getConnection();

        if (connection !== undefined) {
          const playerData = player.getGameDataEntry();
          const oldColor = playerData.getColor();
          const oldName = playerData.getName();

          playerData.setColor(color);
          playerData.setName(name);
          await player.updateGameData();

          await connection.writeReliable(new GameDataPacket([
            new RpcPacket(player.getEntity().getPlayerControl().getNetId(), new SendChatPacket(message.toString())),
          ], this.code));

          playerData.setColor(oldColor);
          playerData.setName(oldName);
          await player.updateGameData();
        }
      }
    }
  }

  /**
   * Adds the given net IDs to the array of ignored net IDs.
   *
   * @internal
   * @param ids - The net IDs to be ignored
   */
  ignoreNetIds(...ids: number[]): void {
    this.ignoredNetIds.push(...ids);
  }

  /**
   * Gets whether or not the lobby is currently spawning player characters.
   *
   * @internal
   * @returns `true` if players are still being spawned, `false` if not
   */
  isSpawningPlayers(): boolean {
    return this.spawningPlayers.size > 0;
  }

  /**
   * Marks a connection as having had their player character successfully
   * spawned.
   *
   * @internal
   * @param connection - The connection to be marked as spawned
   */
  async finishedSpawningPlayer(connection: Connection): Promise<void> {
    this.spawningPlayers.delete(connection);

    const player = this.findPlayerByConnection(connection);

    if (player !== undefined && !player.hasBeenInitialized()) {
      player.setInitialized(true);

      await this.getServer().emit("player.joined", new PlayerJoinedEvent(this, player, connection.isRejoining()));
    }
  }

  /**
   * Adds the given connection to the list of connections whose player
   * characters are currently being spawned.
   *
   * @internal
   * @param connection - The connection to be marked as spawning
   */
  startedSpawningPlayer(connection: Connection): void {
    this.spawningPlayers.add(connection);
  }

  /**
   * Temporarily removes the acting host status from all acting hosts.
   *
   * @internal
   * @param sendImmediately - `true` to send the packet immediately, `false` to send it with the next batch of packets (default `true`)
   */
  async disableActingHosts(sendImmediately: boolean = true): Promise<void> {
    const actingHosts = this.getActingHosts();

    for (let i = 0; i < actingHosts.length; i++) {
      if (actingHosts[i].getLimboState() == LimboState.NotLimbo) {
        await this.sendDisableHost(actingHosts[i], sendImmediately);
      }
    }
  }

  /**
   * Reapplies the acting host status to all acting hosts.
   *
   * @internal
   * @param sendImmediately - `true` to send the packet immediately, `false` to send it with the next batch of packets (default `true`)
   */
  async enableActingHosts(sendImmediately: boolean = true): Promise<void> {
    const actingHosts = this.getActingHosts();

    for (let i = 0; i < actingHosts.length; i++) {
      if (actingHosts[i].getLimboState() == LimboState.NotLimbo) {
        await this.sendEnableHost(actingHosts[i], sendImmediately);
      }
    }
  }

  /**
   * Updates the client for the given connection to enable host abilities.
   *
   * @internal
   * @param connection - The connection whose host abilities will be enabled
   * @param sendImmediately - `true` to send the packet immediately, `false` to send it with the next batch of packets (default `true`)
   */
  async sendEnableHost(connection: Connection, sendImmediately: boolean = true): Promise<void> {
    if (connection.getLimboState() == LimboState.NotLimbo) {
      if (sendImmediately) {
        await connection.sendReliable([new JoinGameResponsePacket(this.code, connection.getId(), connection.getId())]);
      } else {
        await connection.writeReliable(new JoinGameResponsePacket(this.code, connection.getId(), connection.getId()));
      }
    }
  }

  /**
   * Updates the client for the given connection to disable host abilities.
   *
   * @internal
   * @param connection - The connection whose host abilities will be disabled
   * @param sendImmediately - `true` to send the packet immediately, `false` to send it with the next batch of packets (default `true`)
   */
  async sendDisableHost(connection: Connection, sendImmediately: boolean = true): Promise<void> {
    if (connection.getLimboState() == LimboState.NotLimbo) {
      if (sendImmediately) {
        await connection.sendReliable([new JoinGameResponsePacket(this.code, connection.getId(), this.hostInstance.getId())]);
      } else {
        await connection.writeReliable(new JoinGameResponsePacket(this.code, connection.getId(), this.hostInstance.getId()));
      }
    }
  }

  /**
   * Sends the given packet as an unreliable packet to the given connections.
   *
   * @internal
   * @param packet - The packet to be sent
   * @param sendTo - The connections to which the packet will be send (default `this.connections`)
   */
  sendUnreliableRootGamePacket(packet: BaseRootPacket, sendTo?: Connection[]): void {
    if (sendTo === undefined) {
      sendTo = this.connections;
    }

    for (let i = 0; i < sendTo.length; i++) {
      sendTo[i].writeUnreliable(packet);
    }
  }

  /**
   * Removes the given connection from the lobby and migrates hosts.
   *
   * @internal
   * @param connection - The connection that was disconnected
   * @param reason - The reason for why the connection was disconnected
   */
  async handleDisconnect(connection: Connection, reason?: DisconnectReason): Promise<void> {
    const disconnectingConnectionIndex = this.connections.indexOf(connection);
    const disconnectingPlayer = this.findPlayerByConnection(connection);

    if (disconnectingConnectionIndex > -1) {
      this.connections.splice(disconnectingConnectionIndex, 1);
    }

    await this.sendRootGamePacket(new RemovePlayerPacket(this.code, connection.getId(), 0, reason ?? DisconnectReason.exitGame()));

    if (this.meetingHud !== undefined && disconnectingPlayer) {
      const oldMeetingHud = this.meetingHud.getMeetingHud().clone();
      const disconnectedId = disconnectingPlayer.getId();
      const votesToClear: Player[] = [];
      const states = this.meetingHud.getMeetingHud().getPlayerStates();

      for (const [id, state] of states) {
        if (id === disconnectedId) {
          this.meetingHud.getMeetingHud().removePlayerState(id);
        } else if (state.getVotedFor() == disconnectedId) {
          const votingPlayer = this.findPlayerByPlayerId(id);

          if (votingPlayer !== undefined) {
            votesToClear.push(votingPlayer);
          }

          state.setVotedFor(VoteStateConstants.HasNotVoted);
        }
      }

      await this.sendRootGamePacket(new GameDataPacket([
        this.meetingHud.getMeetingHud().serializeData(oldMeetingHud),
      ], this.code));
      await this.meetingHud.getMeetingHud().clearVote(votesToClear);
    }

    if (connection.isActingHost() && this.connections.length > 0) {
      await this.migrateHost(connection);
    }

    await this.hostInstance.handleDisconnect(connection, reason);
    disconnectingPlayer?.getEntity().despawn();
  }

  /**
   * Stops the timer for automatically closing the lobby if the first player
   * takes too long to join.
   *
   * @internal
   */
  cancelJoinTimer(): void {
    if (this.joinTimer !== undefined) {
      clearTimeout(this.joinTimer);
      delete this.joinTimer;
    }
  }

  /**
   * Starts the timer for automatically closing the lobby if the hosts take
   * too long to start a game.
   *
   * @internal
   */
  beginStartTimer(): void {
    if (this.startTimer === undefined && this.timeToStartUntilClosed > 0) {
      this.startTimer = setTimeout(() => {
        this.close();
      }, this.timeToStartUntilClosed * 1000);
    }
  }

  /**
   * Stops the timer for automatically closing the lobby if the hosts take
   * too long to start a game.
   *
   * @internal
   */
  cancelStartTimer(): void {
    if (this.startTimer !== undefined) {
      clearTimeout(this.startTimer);

      delete this.startTimer;
    }
  }

  /**
   * Adds the given connection to the lobby.
   *
   * @internal
   * @param connection - The connection that is joining the lobby
   */
  async handleJoin(connection: Connection): Promise<void> {
    this.logger.verbose("Connection %s joining", connection);

    if (this.connections.indexOf(connection) == -1) {
      const count = this.connections.length;
      const isGameStarted = this.gameState == GameState.Started;

      if (count >= this.options.getMaxPlayers() ||
          count >= this.server.getMaxPlayersPerLobby() ||
          isGameStarted
      ) {
        const event = new ServerLobbyJoinRefusedEvent(
          connection,
          this,
          isGameStarted ? DisconnectReason.gameStarted() : DisconnectReason.gameFull(),
        );

        await this.server.emit("server.lobby.join.refused", event);

        if (!event.isCancelled()) {
          this.logger.verbose("Preventing connection %s from joining full lobby", connection);

          await connection.writeReliable(new JoinGameErrorPacket(event.getDisconnectReason()));

          return;
        }

        this.logger.verbose("Allowing connection %s to join full lobby", connection);
      }
    }

    if (connection.getLobby() === undefined) {
      connection.setLobby(this);

      connection.on("packet", async (packet: BaseRootPacket) => await this.handlePacket(packet, connection));
    }

    if (this.gameState == GameState.Ended) {
      // TODO: Dead code, Host#endGame sets gameState to NotStarted
      await this.handleRejoin(connection);

      return;
    }

    await this.handleNewJoin(connection);
  }

  /**
   * Called when the lobby receives a packet from a connection.
   *
   * @internal
   * @param packet - The packet that was sent to the lobby
   * @param connection - The connection that sent the packet
   */
  protected async handlePacket(packet: BaseRootPacket, connection: Connection): Promise<void> {
    switch (packet.getType()) {
      case RootPacketType.AlterGameTag: {
        const data = packet as AlterGameTagPacket;

        await this.setGameTag(data.tag, data.value);
        break;
      }
      case RootPacketType.GameData:
        // fallthrough
      case RootPacketType.GameDataTo: {
        if (connection.getLimboState() == LimboState.PreSpawn) {
          return;
        }

        const gameData = packet as GameDataPacket;
        let target: Connection | undefined;

        if (gameData.targetClientId !== undefined) {
          target = this.findConnection(gameData.targetClientId);
        }

        for (let i = 0; i < gameData.packets.length; i++) {
          await this.handleGameDataPacket(gameData.packets[i], connection, target !== undefined ? [target] : undefined);
        }
        break;
      }
      case RootPacketType.KickPlayer: {
        const data = packet as KickPlayerPacket;
        const id = data.kickedClientId;
        const connectionToKick = this.findConnection(id);

        if (connectionToKick === undefined) {
          this.logger.warn(`KickPlayer sent for unknown client: ${id}`);

          return;
        }

        if (connection.isActingHost()) {
          await connectionToKick.sendKick(data.banned, this.findPlayerByConnection(connection), data.disconnectReason);
        }
        break;
      }
      case RootPacketType.EndGame:
        break;
      case RootPacketType.RemoveGame:
        break;
      case RootPacketType.RemovePlayer:
        break;
      case RootPacketType.StartGame:
        break;
      case RootPacketType.WaitForHost:
        break;
      case RootPacketType.JoinGame:
        break;
      default: {
        if (RootPacket.hasPacket(packet.getType())) {
          break;
        }

        throw new Error(`Attempted to handle an unimplemented root game packet type: ${packet.getType()} (${RootPacketType[packet.getType()]})`);
      }
    }
  }

  /**
   * Called when the lobby receives a GameData packet from a connection.
   *
   * @internal
   * @param packet - The packet that was sent to the lobby
   * @param connection - The connection that sent the packet
   * @param sendTo - The connections to which the packet was intended to be sent
   */
  protected async handleGameDataPacket(packet: BaseGameDataPacket, connection: Connection, sendTo?: Connection[]): Promise<void> {
    sendTo = ((sendTo !== undefined && sendTo.length > 0) ? sendTo : this.connections).filter(con => con.getId() != connection.getId());

    if (packet.getType() in GameDataPacketType) {
      if (this.server.listenerCount("server.packet.in.gamedata") > 0) {
        const event = new ServerPacketInGameDataEvent(connection, packet);

        await this.server.emit("server.packet.in.gamedata", event);

        if (event.isCancelled()) {
          return;
        }
      }
    } else {
      const custom = GameDataPacket.getPacket(packet.getType());

      if (custom !== undefined) {
        if (this.server.listenerCount("server.packet.in.gamedata.custom") > 0) {
          const event = new ServerPacketInGameDataCustomEvent(connection, packet);

          await this.server.emit("server.packet.in.gamedata.custom", event);

          if (event.isCancelled()) {
            return;
          }
        }

        custom.handle(connection, packet);

        return;
      }
    }

    switch (packet.getType()) {
      case GameDataPacketType.Data:
        if (!this.ignoredNetIds.includes((packet as DataPacket).senderNetId)) {
          await this.handleData((packet as DataPacket).senderNetId, (packet as DataPacket).data, sendTo);
        }
        break;
      case GameDataPacketType.RPC: {
        const rpc = packet as RpcPacket;

        if (this.ignoredNetIds.includes(rpc.senderNetId)) {
          break;
        }

        if (rpc.packet.getType() in RpcPacketType) {
          const object = this.findInnerNetObject(rpc.senderNetId);

          if (this.server.listenerCount("server.packet.in.rpc") > 0) {
            const event = new ServerPacketInRpcEvent(connection, rpc.senderNetId, object, rpc.packet);

            await this.server.emit("server.packet.in.rpc", event);

            if (event.isCancelled()) {
              break;
            }
          }

          if (rpc.senderNetId === MaxValue.UInt32) {
            this.getLogger().warn("RPC packet sent from unexpected InnerNetObject: -1");

            return;
          }

          if (object === undefined) {
            throw new Error(`RPC packet sent from unknown InnerNetObject: ${rpc.senderNetId}`);
          }

          object.handleRpc(connection, rpc.packet.getType(), rpc.packet, sendTo);
        } else {
          const custom = RpcPacket.getPacket(rpc.packet.getType());

          if (custom !== undefined) {
            const object = this.findInnerNetObject(rpc.senderNetId);

            if (object === undefined) {
              throw new Error(`RPC packet sent from unknown InnerNetObject: ${rpc.senderNetId}`);
            }

            if (this.server.listenerCount("server.packet.in.rpc.custom") > 0) {
              const event = new ServerPacketInRpcCustomEvent(connection, rpc.senderNetId, object, rpc.packet);

              await this.server.emit("server.packet.in.rpc.custom", event);

              if (event.isCancelled()) {
                break;
              }
            }

            custom.handle(connection, rpc.packet, object);
          }
        }
        break;
      }
      case GameDataPacketType.Spawn:
        break;
      case GameDataPacketType.Despawn:
        break;
      case GameDataPacketType.Ready:
        await this.hostInstance.handleReady(connection);
        break;
      case GameDataPacketType.SceneChange: {
        if ((packet as SceneChangePacket).scene !== Scene.OnlineGame) {
          return;
        }

        const connectionChangingScene = this.findSafeConnection((packet as SceneChangePacket).clientId);

        await this.hostInstance.handleSceneChange(connectionChangingScene, (packet as SceneChangePacket).scene);
        break;
      }
      case GameDataPacketType.ClientInfo:
        connection.setPlatform((packet as ClientInfoPacket).platform);
        break;
      default:
        throw new Error(`Attempted to handle an unimplemented game data packet type: ${packet.getType() as number} (${GameDataPacketType[packet.getType()]})`);
    }
  }

  /**
   * Called when the lobby receives a Data packet from a connection.
   *
   * @param netId - The net ID of the InnerNetObject that sent the packet
   * @param data - The packet's data
   * @param sendTo - The connections to which the packet was intended to be sent
   */
  protected async handleData(netId: number, data: MessageReader | MessageWriter, sendTo?: Connection[]): Promise<void> {
    const object = this.findSafeInnerNetObject(netId);

    if (object.getType() == InnerNetObjectType.CustomNetworkTransform) {
      await (object as InnerCustomNetworkTransform).setData(data);
      this.sendUnreliableRootGamePacket(
        new GameDataPacket([(object as InnerCustomNetworkTransform).serializeData()], this.code),
        sendTo ?? [],
      );
    }
  }

  /**
   * Spawns a player for the given connection.
   *
   * @internal
   * @param connection - The connection that joined the lobby
   */
  protected async handleNewJoin(connection: Connection): Promise<void> {
    if (this.connections.indexOf(connection) == -1) {
      this.connections.push(connection);
    }

    if (this.connections.length == 1) {
      this.cancelJoinTimer();
      // this.beginStartTimer();
    }

    connection.setLimboState(LimboState.NotLimbo);

    this.startedSpawningPlayer(connection);
    await this.sendJoinedMessage(connection);
    await this.broadcastJoinMessage(connection);
  }

  /**
   * Disconnects players from the lobby if they took to long to rejoin.
   *
   * @internal
   * @param connection - The connection that rejoined the lobby
   */
  protected async handleRejoin(connection: Connection): Promise<void> {
    if (connection.getLobby()?.code != this.code) {
      await connection.sendReliable([new JoinGameErrorPacket(DisconnectReason.gameStarted())]);
    }
  }

  /**
   * Assigns a new acting host when an acting host leaves the lobby.
   *
   * @internal
   * @param oldHost - The connection that is no longer an acting host
   */
  protected async migrateHost(oldHost: Connection): Promise<void> {
    const event = new LobbyHostMigratedEvent(this, oldHost, this.connections[0]);

    await this.server.emit("lobby.host.migrated", event);

    if (event.isCancelled()) {
      return;
    }

    if (this.getHostInstance().isCountingDown() || this.game !== undefined) {
      event.getNewHost().setActingHost(true);
    } else {
      await event.getNewHost().syncActingHost(true, true);
    }
  }

  /**
   * Sends a JoinGameResponse packet to all connections in the lobby when
   * another connection joins the lobby.
   *
   * @internal
   * @param connection - The connection that joined the lobby
   */
  protected async broadcastJoinMessage(connection: Connection): Promise<void> {
    for (let i = 0; i < this.connections.length; i++) {
      const writeConnection = this.connections[i];

      if (writeConnection.getId() === connection.getId()) {
        continue;
      }

      await writeConnection.sendReliable([
        new JoinGameResponsePacket(
          this.code,
          connection.getId(),
          writeConnection.isActingHost() ? writeConnection.getId() : this.hostInstance.getId(),
        ),
      ]);
    }
  }

  /**
   * Sends a JoinedGame packet to the given connection.
   *
   * @internal
   * @param connection - The connection that joined the lobby
   */
  protected async sendJoinedMessage(connection: Connection): Promise<void> {
    await connection.sendReliable([
      new JoinedGamePacket(
        this.code,
        connection.getId(),
        this.hostInstance.getId(),
        this.connections
          .filter(con => con.getId() != connection.getId() && con.getLimboState() == LimboState.NotLimbo)
          .map(con => con.getId())),
      new AlterGameTagPacket(
        this.code,
        AlterGameTag.ChangePrivacy,
        this.getGameTag(AlterGameTag.ChangePrivacy) ?? 0),
    ]);
  }
}
