import { PlayerSkin, PlayerPet, PlayerHat, PlayerColor, PlayerRole, TeleportReason, SpawnFlag } from "../types/enums";
import { RemovePlayerPacket, JoinGameResponsePacket, GameDataPacket } from "../protocol/packets/root";
import { DisconnectReason, LevelTask, LevelVent, Vector2 } from "../types";
import { PlayerData } from "../protocol/entities/gameData/types";
import { DespawnPacket } from "../protocol/packets/gameData";
import { SetInfectedPacket } from "../protocol/packets/rpc";
import { EntityPlayer } from "../protocol/entities/player";
import { Connection } from "../protocol/connection";
import { PlayerInstance } from "../api/player";
import { LobbyInstance } from "../api/lobby";
import { TextComponent } from "../api/text";
import { Lobby } from "../lobby";
import { Host } from "../host";
import {
  PlayerRevivedEvent,
  PlayerRoleUpdatedEvent,
  PlayerTaskAddedEvent,
  PlayerTaskRemovedEvent,
  PlayerTaskUncompletedEvent,
} from "../api/events/player";

export class Player implements PlayerInstance {
  protected readonly createdAt = Date.now();
  protected readonly metadata: Map<string, unknown> = new Map();

  protected name: TextComponent;
  protected role: PlayerRole = PlayerRole.Crewmate;
  protected initialized = false;

  /**
   * @param lobby - The lobby in which the player exists
   * @param entity - The entity that belongs to the player
   * @param connection - The connection to which the player belongs
   */
  constructor(
    protected readonly lobby: Lobby,
    protected entity: EntityPlayer,
    protected readonly connection?: Connection,
  ) {
    this.name = TextComponent.from(connection?.getName() ?? "");
  }

  getCreatedAt(): number {
    return this.createdAt;
  }

  getId(): number {
    return this.entity.getPlayerControl().getPlayerId();
  }

  getConnection(): Connection | undefined {
    return this.connection;
  }

  getSafeConnection(): Connection {
    if (this.connection === undefined) {
      throw new Error(`Player ${this.getId()} does not have a connection`);
    }

    return this.connection;
  }

  getLobby(): LobbyInstance {
    return this.lobby;
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

  getName(): TextComponent {
    return this.name;
  }

  async setName(name: TextComponent | string): Promise<void> {
    if (name instanceof TextComponent) {
      this.name = name;
    } else {
      this.name = TextComponent.from(name);
    }

    await this.entity.getPlayerControl().setName(name.toString(), this.lobby.getConnections());
  }

  getColor(): PlayerColor {
    return this.getGameDataEntry().getColor();
  }

  async setColor(color: PlayerColor): Promise<void> {
    await this.entity.getPlayerControl().setColor(color, this.lobby.getConnections());
  }

  getHat(): PlayerHat {
    return this.getGameDataEntry().getHat();
  }

  async setHat(hat: PlayerHat): Promise<void> {
    await this.entity.getPlayerControl().handleSetHat(hat, this.lobby.getConnections());
  }

  getPet(): PlayerPet {
    return this.getGameDataEntry().getPet();
  }

  async setPet(pet: PlayerPet): Promise<void> {
    await this.entity.getPlayerControl().handleSetPet(pet, this.lobby.getConnections());
  }

  getSkin(): PlayerSkin {
    return this.getGameDataEntry().getSkin();
  }

  async setSkin(skin: PlayerSkin): Promise<void> {
    await this.entity.getPlayerControl().handleSetSkin(skin, this.lobby.getConnections());
  }

  getRole(): PlayerRole {
    return this.role;
  }

  setRole(role: PlayerRole): void {
    this.role = role;

    this.getGameDataEntry().setImpostor(role == PlayerRole.Impostor);
  }

  isImpostor(): boolean {
    // return this.getGameDataEntry().isImpostor;
    return this.role == PlayerRole.Impostor;
  }

  async setImpostor(): Promise<void> {
    if (this.isImpostor()) {
      return;
    }

    const event = new PlayerRoleUpdatedEvent(this, PlayerRole.Impostor, this.role);

    await this.lobby.getServer().emit("player.role.updated", event);

    if (event.isCancelled()) {
      return;
    }

    // TODO: Check end state
    // TODO: Send UpdateGameData packet

    await this.entity.getPlayerControl().sendRpcPacket(
      new SetInfectedPacket([this.getId()]),
      this.lobby.getConnections(),
    );
  }

  async setCrewmate(): Promise<void> {
    // TODO: Is this possible?
    this.lobby.getLogger().warn("PlayerInstance#setCrewmate() is not yet implemented");

    return new Promise(resolve => resolve());
  }

  isDead(): boolean {
    return this.getGameDataEntry().isDead();
  }

  getTasks(): [LevelTask, boolean][] {
    return this.getGameDataEntry().getTasks();
  }

  async setTasks(tasks: Set<LevelTask>): Promise<void> {
    await this.lobby.getHostInstance().setPlayerTasks(this, [...tasks]);
  }

  async addTasks(tasks: Set<LevelTask>): Promise<void> {
    const taskList = [...this.getGameDataEntry().getTasks()];

    for (let i = 0; i < tasks.size; i++) {
      if (taskList.findIndex(task => task[0] == tasks[i]) > -1) {
        continue;
      }

      taskList.push(tasks[i]);
    }

    const event = new PlayerTaskAddedEvent(this, tasks);

    await this.lobby.getServer().emit("player.task.added", event);

    if (!event.isCancelled()) {
      this.getGameDataEntry().setTasks(taskList);
      await (this.lobby.getHostInstance() as Host).updatePlayerTasks(this, taskList.map(task => task[0]));
    }
  }

  async removeTasks(tasks: Set<LevelTask>): Promise<void> {
    const taskList = [...this.getGameDataEntry().getTasks()];

    for (let i = 0; i < tasks.size; i++) {
      const index = taskList.findIndex(task => task[0] == tasks[i]);

      if (index > -1) {
        taskList.splice(index, 1);
      }
    }

    const event = new PlayerTaskRemovedEvent(this, tasks);

    await this.lobby.getServer().emit("player.task.removed", event);

    if (!event.isCancelled()) {
      this.getGameDataEntry().setTasks(taskList);
      await (this.lobby.getHostInstance() as Host).updatePlayerTasks(this, taskList.map(task => task[0]));
    }
  }

  isTaskAtIndexCompleted(taskIndex: number): boolean {
    return this.getGameDataEntry().isTaskAtIndexCompleted(taskIndex);
  }

  isTaskCompleted(task: LevelTask): boolean {
    return this.getGameDataEntry().isTaskCompleted(task);
  }

  async completeTaskAtIndex(taskIndex: number): Promise<void> {
    await this.entity.getPlayerControl().handleCompleteTask(taskIndex, this.lobby.getConnections());
  }

  async completeTask(task: LevelTask): Promise<void> {
    await this.entity.getPlayerControl().handleCompleteTask(this.getTasks().findIndex(t => t[0] == task), this.lobby.getConnections());
  }

  async uncompleteTaskAtIndex(taskIndex: number): Promise<void> {
    const task = this.getTasks()[taskIndex][0];
    const event = new PlayerTaskUncompletedEvent(this, taskIndex, task);

    await this.lobby.getServer().emit("player.task.uncompleted", event);

    if (!event.isCancelled()) {
      this.getGameDataEntry().completeTaskAtIndex(taskIndex, false);
    }
  }

  async uncompleteTask(task: LevelTask): Promise<void> {
    const taskIndex = this.getTasks().findIndex(t => t[0] == task);
    const event = new PlayerTaskUncompletedEvent(this, taskIndex, task);

    await this.lobby.getServer().emit("player.task.uncompleted", event);

    if (!event.isCancelled()) {
      this.getGameDataEntry().completeTask(task, false);
    }
  }

  getPosition(): Vector2 {
    return this.entity.getCustomNetworkTransform().getPosition();
  }

  async setPosition(position: Vector2, reason: TeleportReason = TeleportReason.Unknown): Promise<void> {
    await this.entity.getCustomNetworkTransform().handleSnapTo(position, reason, this.lobby.getConnections());
  }

  getVelocity(): Vector2 {
    return this.entity.getCustomNetworkTransform().getVelocity();
  }

  getVent(): LevelVent | undefined {
    return this.entity.getPlayerPhysics().getVent();
  }

  async enterVent(vent: LevelVent): Promise<void> {
    await this.entity.getPlayerPhysics().handleEnterVent(vent, this.lobby.getConnections());
  }

  async exitVent(vent: LevelVent): Promise<void> {
    await this.entity.getPlayerPhysics().handleExitVent(vent, this.lobby.getConnections());
  }

  isScanning(): boolean {
    return this.entity.getPlayerControl().isScanning();
  }

  async kill(): Promise<void> {
    const gameData = this.lobby.getSafeGameData();

    await this.entity.getPlayerControl().exile();
    await gameData.getGameData().updateGameData([this.getGameDataEntry()], this.lobby.getConnections());

    if (this.isImpostor()) {
      await this.lobby.getHostInstance().handleImpostorDeath();
    } else {
      await this.lobby.getHostInstance().handleMurderPlayer(this.entity.getPlayerControl(), 0);
    }
  }

  async murder(player: PlayerInstance): Promise<void> {
    const playerControl = this.entity.getPlayerControl();

    await playerControl.handleMurderPlayer((player as Player).entity.getPlayerControl().getNetId(), this.lobby.getConnections());
    await this.lobby.getHostInstance().handleMurderPlayer(playerControl, 0);
  }

  async revive(): Promise<void> {
    const gameData = this.lobby.getSafeGameData();

    const event = new PlayerRevivedEvent(this);

    await this.lobby.getServer().emit("player.revived", event);

    if (event.isCancelled()) {
      return;
    }

    const entity = new EntityPlayer(
      this.lobby,
      this.entity.getOwnerId(),
      this.entity.getCustomNetworkTransform().getPosition(),
      this.entity.getCustomNetworkTransform().getVelocity(),
      this.getId()!,
      false,
      SpawnFlag.None,
    );

    if (this.connection === undefined) {
      throw new Error("Tried to respawn a player without a connection");
    }

    const oldName = this.getName();

    this.lobby.ignoreNetIds(
      this.entity.getPlayerControl().getNetId(),
      this.entity.getPlayerPhysics().getNetId(),
      this.entity.getCustomNetworkTransform().getNetId(),
    );

    await this.setName("");

    if (this.connection.isActingHost()) {
      await this.connection.writeReliable(new RemovePlayerPacket(this.lobby.getCode(), this.entity.getOwnerId(), this.entity.getOwnerId(), DisconnectReason.destroy()));
      await this.connection.writeReliable(new JoinGameResponsePacket(this.lobby.getCode(), this.entity.getOwnerId(), this.entity.getOwnerId()));
    } else {
      await this.connection.writeReliable(new RemovePlayerPacket(this.lobby.getCode(), this.entity.getOwnerId(), this.lobby.getHostInstance().getId(), DisconnectReason.destroy()));
      await this.connection.writeReliable(new JoinGameResponsePacket(this.lobby.getCode(), this.entity.getOwnerId(), this.lobby.getHostInstance().getId()));
    }

    await this.setName(oldName);

    const connections = this.lobby.getConnections();

    for (let i = 0; i < connections.length; i++) {
      const connection = connections[i];

      if (connection.getId() != this.entity.getOwnerId()) {
        await connection.writeReliable(new GameDataPacket([
          new DespawnPacket(this.entity.getPlayerControl().getNetId()),
          new DespawnPacket(this.entity.getPlayerPhysics().getNetId()),
          new DespawnPacket(this.entity.getCustomNetworkTransform().getNetId()),
        ], this.lobby.getCode()));
      }
    }

    this.getGameDataEntry().setDead(false);

    this.entity = entity;

    await gameData.getGameData().updateGameData([this.getGameDataEntry()], connections);

    await this.lobby.sendRootGamePacket(new GameDataPacket([
      entity.serializeSpawn(),
    ], this.lobby.getCode()));
  }

  async sendChat(message: string): Promise<void> {
    await this.entity.getPlayerControl().handleSendChat(message, this.lobby.getConnections());
  }

  async startMeeting(victim?: PlayerInstance): Promise<void> {
    await this.lobby.getHostInstance().handleReportDeadBody(this.entity.getPlayerControl(), victim?.getId());
  }

  async castVote(suspect?: PlayerInstance): Promise<void> {
    const meetingHud = this.lobby.getMeetingHud();

    if (meetingHud !== undefined) {
      await meetingHud.getMeetingHud().castVote(this.getId(), suspect?.getId() ?? -1);
    }
  }

  async clearVote(): Promise<void> {
    const meetingHud = this.lobby.getMeetingHud();

    if (meetingHud !== undefined) {
      await meetingHud.getMeetingHud().clearVote([this]);
    }
  }

  async castVoteKick(target: PlayerInstance): Promise<void> {
    await this.lobby.getSafeGameData().getVoteBanSystem().addVote(this, target as Player, this.lobby.getConnections());
  }

  async clearVoteKick(target: PlayerInstance): Promise<void> {
    await this.lobby.getSafeGameData().getVoteBanSystem().clearVote(this, target as Player, this.lobby.getConnections());
  }

  async clearVoteKicksForMe(): Promise<void> {
    await this.lobby.getSafeGameData().getVoteBanSystem().clearVotesForPlayer(this, this.lobby.getConnections());
  }

  async clearVoteKicksFromMe(): Promise<void> {
    await this.lobby.getSafeGameData().getVoteBanSystem().clearVotesFromPlayer(this, this.lobby.getConnections());
  }

  async kick(reason?: DisconnectReason): Promise<void> {
    if (this.connection === undefined) {
      throw new Error(`Player ${this.getId()} does not have a connection on the lobby instance`);
    }

    await this.connection.sendKick(false, undefined, reason);
  }

  async ban(reason?: DisconnectReason): Promise<void> {
    if (this.connection === undefined) {
      throw new Error(`Player ${this.getId()} does not have a connection on the lobby instance`);
    }

    await this.connection.sendKick(true, undefined, reason);
  }

  getGameDataEntry(): PlayerData {
    return this.lobby.getSafeGameData().getGameData().getSafePlayer(this.getId());
  }

  async updateGameData(): Promise<void> {
    await this.lobby.getSafeGameData().getGameData().updateGameData([this.getGameDataEntry()], this.lobby.getConnections());
  }

  /**
   * Gets the player's entity containing their PlayerControl, PlayerPhysics, and
   * CustomNetworkTransform InnerNetObjects.
   *
   * @internal
   */
  getEntity(): EntityPlayer {
    return this.entity;
  }

  /**
   * Gets whether or not the player has been successfully initialized by the
   * connection and server.
   *
   * @internal
   */
  hasBeenInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Sets whether or not the player has been successfully initialized by the
   * connection and server.
   *
   * @internal
   * @param initialized - `true` if the player has been initialized, `false` if not
   */
  setInitialized(initialized: boolean): this {
    this.initialized = initialized;

    return this;
  }
}
