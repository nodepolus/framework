import { DataPacket, SpawnPacketObject } from "../../packets/gameData";
import { LobbyOptionsUpdatedEvent } from "../../../api/events/lobby";
import { InternalSystemType } from "../shipStatus/baseShipStatus";
import { MovingPlatformSystem } from "../shipStatus/systems";
import { GameOptionsData, Immutable } from "../../../types";
import { MessageWriter } from "../../../util/hazelMessage";
import { PlayerInstance } from "../../../api/player";
import { GameDataPacket } from "../../packets/root";
import { BaseInnerNetObject } from "../baseEntity";
import { TextComponent } from "../../../api/text";
import { PlayerData } from "../gameData/types";
import { Connection } from "../../connection";
import { Lobby } from "../../../lobby";
import { EntityPlayer } from ".";
import {
  PlayerChatMessageEvent,
  PlayerChatNoteEvent,
  PlayerColorUpdatedEvent,
  PlayerDiedEvent,
  PlayerHatUpdatedEvent,
  PlayerMurderedEvent,
  PlayerNameUpdatedEvent,
  PlayerPetUpdatedEvent,
  PlayerSkinUpdatedEvent,
  PlayerTaskAnimationEvent,
  PlayerTaskCompletedEvent,
} from "../../../api/events/player";
import {
  ChatNoteType,
  DeathReason,
  GameState,
  InnerNetObjectType,
  PlayerColor,
  PlayerHat,
  PlayerPet,
  PlayerSkin,
  RpcPacketType,
  TaskType,
} from "../../../types/enums";
import {
  BaseRpcPacket,
  CheckColorPacket,
  CheckNamePacket,
  CompleteTaskPacket,
  ExiledPacket,
  MurderPlayerPacket,
  PlayAnimationPacket,
  ReportDeadBodyPacket,
  SendChatNotePacket,
  SendChatPacket,
  SetColorPacket,
  SetHatPacket,
  SetNamePacket,
  SetPetPacket,
  SetScannerPacket,
  SetSkinPacket,
  SetStartCounterPacket,
  SetTasksPacket,
  SyncSettingsPacket,
} from "../../packets/rpc";

export class InnerPlayerControl extends BaseInnerNetObject {
  protected scanning = false;
  protected scannerSequenceId = 1;

  constructor(
    protected readonly parent: EntityPlayer,
    protected playerId: number = parent.getLobby().getHostInstance().getNextPlayerId(),
    protected newPlayer: boolean = false,
    netId: number = parent.getLobby().getHostInstance().getNextNetId(),
  ) {
    super(InnerNetObjectType.PlayerControl, parent, netId);
  }

  getPlayerId(): number {
    return this.playerId;
  }

  setPlayerId(playerId: number): void {
    this.playerId = playerId;
  }

  isNewPlayer(): boolean {
    return this.newPlayer;
  }

  setNewPlayer(newPlayer: boolean): void {
    this.newPlayer = newPlayer;
  }

  isScanning(): boolean {
    return this.scanning;
  }

  setScanning(scanning: boolean): void {
    this.scanning = scanning;
  }

  getScannerSequenceId(): number {
    return this.scannerSequenceId;
  }

  setScannerSequenceId(scannerSequenceId: number): void {
    this.scannerSequenceId = scannerSequenceId;
  }

  async handlePlayAnimation(taskType: TaskType, sendTo?: Connection[]): Promise<void> {
    const event = new PlayerTaskAnimationEvent(this.getPlayer(), taskType);

    await this.getLobby().getServer().emit("player.task.animation", event);

    if (event.isCancelled()) {
      return;
    }

    await this.sendRpcPacket(new PlayAnimationPacket(event.getTaskType()), sendTo);
  }

  async handleCompleteTask(taskIndex: number, sendTo?: Connection[]): Promise<void> {
    if (this.getLobby().getGameState() == GameState.Ended || this.getLobby().getGameState() == GameState.Destroyed) {
      return;
    }

    const playerData = this.getPlayerData();
    const taskCount = playerData.getTasks().length;

    if (taskCount < taskIndex) {
      throw new Error(`Player ${this.playerId} has fewer tasks (${taskCount}) than the requested index (${taskIndex})`);
    }

    playerData.completeTaskAtIndex(taskIndex);

    const event = new PlayerTaskCompletedEvent(this.getPlayer(), taskIndex, playerData.getTasks()[taskIndex][0]);

    await this.getLobby().getServer().emit("player.task.completed", event);

    if (event.isCancelled()) {
      const connection = this.getConnection();
      const tasks = [...playerData.getTasks()];
      const deleted = tasks.splice(taskIndex, 1);

      playerData.completeTaskAtIndex(taskIndex, false);
      await this.sendRpcPacket(new SetTasksPacket(this.playerId, tasks.map(task => task[0].id)), [connection]);
      tasks.splice(taskIndex, 0, deleted[0]);
      await this.sendRpcPacket(new SetTasksPacket(this.playerId, tasks.map(task => task[0].id)), [connection]);

      for (let i = 0; i < tasks.length; i++) {
        if (!tasks[1]) {
          continue;
        }

        await this.sendRpcPacket(new CompleteTaskPacket(i), [connection]);
      }

      return;
    }
    await this.sendRpcPacket(new CompleteTaskPacket(taskIndex), sendTo);
    await this.getLobby().getHostInstance().checkForTaskWin();
  }

  async handleSyncSettings(options: GameOptionsData, _sendTo?: Connection[]): Promise<void> {
    const lobby = this.getLobby() as Lobby;
    const oldOptions = lobby.getOptions();
    const owner = lobby.findSafeConnection(this.getOwnerId());

    if (!owner.isActingHost()) {
      await this.sendRpcPacket(new SyncSettingsPacket(options), [owner]);

      return;
    }

    const player = lobby.findSafePlayerByConnection(owner);
    const event = new LobbyOptionsUpdatedEvent(lobby, player, oldOptions.clone() as Immutable<GameOptionsData>, options);

    await lobby.getServer().emit("lobby.options.updated", event);

    if (event.isCancelled()) {
      await this.sendRpcPacket(new SyncSettingsPacket(options), [owner]);

      return;
    }

    const newOptions = event.getNewOptions();
    const sendTo = lobby.getConnections();

    lobby.setOptions(newOptions);
    await this.syncSettings(newOptions, options.equals(newOptions) ? sendTo.filter(con => con.getId() !== owner.getId()) : sendTo);
  }

  async syncSettings(options: GameOptionsData, sendTo: Connection[]): Promise<void> {
    await this.sendRpcPacket(new SyncSettingsPacket(options), sendTo);
  }

  async exile(): Promise<void> {
    const event = new PlayerDiedEvent(this.getPlayer(), DeathReason.Unknown);

    await this.getLobby().getServer().emit("player.died", event);

    if (event.isCancelled()) {
      return;
    }

    this.getPlayerData().setDead(true);
    await this.sendRpcPacket(new ExiledPacket(), [this.getConnection()]);
  }

  async handleCheckName(name: string, _sendTo?: Connection[]): Promise<void> {
    let checkName: string = name;
    let index = 1;

    const lobby = this.getLobby() as Lobby;
    const owner = lobby.findSafeConnection(this.getOwnerId());
    const player = lobby.findSafePlayerByConnection(owner);
    const connection = this.getConnection();

    await lobby.getHostInstance().ensurePlayerDataExists(player);

    while (this.getLobby().getSafeGameData().getGameData().isNameTaken(checkName, this.getPlayerId())) {
      checkName = `${name} ${index++}`;
    }

    await player.setName(checkName);

    await lobby.finishedSpawningPlayer(owner);

    if (lobby.getActingHosts().length === 0) {
      await connection.syncActingHost(true);
    } else if (connection.isActingHost()) {
      await (this.getLobby() as Lobby).sendEnableHost(connection, true);
    }
  }

  async setName(name: string, sendTo?: Connection[]): Promise<void> {
    const player = this.getPlayer();
    const event = new PlayerNameUpdatedEvent(player, player.getName(), TextComponent.from(name));

    await this.getLobby().getServer().emit("player.name.updated", event);

    if (event.isCancelled()) {
      sendTo = [this.getConnection()];

      event.setNewName(event.getOldName());
    }

    this.getPlayerData().setName(event.getNewName().toString());
    await this.sendRpcPacket(new SetNamePacket(event.getNewName().toString()), sendTo);
  }

  async handleCheckColor(color: PlayerColor, _sendTo?: Connection[]): Promise<void> {
    const player = this.getLobby().findSafePlayerByClientId(this.getOwnerId());
    const numberOfColors = (Object.keys(PlayerColor).length / 2) - 1;
    const takenColors = this.getLobby().getSafeGameData().getGameData().getTakenColors(this.getPlayerId());
    let setColor: PlayerColor = color;

    await this.getLobby().getHostInstance().ensurePlayerDataExists(player);

    if (takenColors.size <= numberOfColors) {
      while (takenColors.has(setColor)) {
        setColor = (setColor + 1) % numberOfColors;
      }
    }

    await this.setColor(setColor, this.getLobby().getConnections());
  }

  async handleSetColor(color: PlayerColor, _sendTo?: Connection[]): Promise<void> {
    const owner = this.getLobby().findSafeConnection(this.getOwnerId());
    const player = this.getLobby().findSafePlayerByConnection(owner);

    await this.getLobby().getHostInstance().ensurePlayerDataExists(player);

    if (owner.isActingHost()) {
      await this.setColor(color, this.getLobby().getConnections());
    } else {
      // TODO: Fix desync (?)
      await this.setColor(player.getColor(), this.getLobby().getConnections());
    }
  }

  async setColor(color: PlayerColor, sendTo?: Connection[]): Promise<void> {
    const player = this.getPlayer();
    const event = new PlayerColorUpdatedEvent(player, player.getColor(), color);

    await this.getLobby().getServer().emit("player.color.updated", event);

    if (event.isCancelled()) {
      sendTo = [this.getConnection()];

      event.setNewColor(event.getOldColor());
    }

    this.getPlayerData().setColor(event.getNewColor());
    await this.sendRpcPacket(new SetColorPacket(event.getNewColor()), sendTo);
  }

  async handleSetHat(hat: PlayerHat, sendTo?: Connection[]): Promise<void> {
    const player = this.getPlayer();
    const event = new PlayerHatUpdatedEvent(player, player.getHat(), hat);

    await this.getLobby().getServer().emit("player.hat.updated", event);

    if (event.isCancelled()) {
      sendTo = [this.getConnection()];

      event.setNewHat(event.getOldHat());
    }

    this.getPlayerData().setHat(event.getNewHat());
    await this.sendRpcPacket(new SetHatPacket(event.getNewHat()), sendTo);
  }

  async handleSetPet(pet: PlayerPet, sendTo?: Connection[]): Promise<void> {
    const player = this.getPlayer();
    const event = new PlayerPetUpdatedEvent(player, player.getPet(), pet);

    await this.getLobby().getServer().emit("player.pet.updated", event);

    if (event.isCancelled()) {
      sendTo = [this.getConnection()];

      event.setNewPet(event.getOldPet());
    }

    this.getPlayerData().setPet(event.getNewPet());
    await this.sendRpcPacket(new SetPetPacket(event.getNewPet()), sendTo);
  }

  async handleSetSkin(skin: PlayerSkin, sendTo?: Connection[]): Promise<void> {
    const player = this.getPlayer();
    const event = new PlayerSkinUpdatedEvent(player, player.getSkin(), skin);

    await this.getLobby().getServer().emit("player.skin.updated", event);

    if (event.isCancelled()) {
      sendTo = [this.getConnection()];

      event.setNewSkin(event.getOldSkin());
    }

    this.getPlayerData().setSkin(event.getNewSkin());
    await this.sendRpcPacket(new SetSkinPacket(event.getNewSkin()), sendTo);
  }

  async handleMurderPlayer(victimPlayerControlNetId: number, sendTo?: Connection[]): Promise<void> {
    const victim = this.getLobby().findSafePlayerByNetId(victimPlayerControlNetId);
    const event = new PlayerMurderedEvent(victim, this.getPlayer());

    victim.getGameDataEntry().setDead(true);

    await this.getLobby().getServer().emit("player.died", event);
    await this.getLobby().getServer().emit("player.murdered", event);

    if (event.isCancelled()) {
      victim.getGameDataEntry().setDead(false);

      return;
    }

    await this.sendRpcPacket(new MurderPlayerPacket(victimPlayerControlNetId), sendTo);
  }

  async handleSendChat(message: string, sendTo?: Connection[]): Promise<void> {
    const event = new PlayerChatMessageEvent(this.getPlayer(), TextComponent.from(message));

    await this.getLobby().getServer().emit("player.chat.message", event);

    if (event.isCancelled()) {
      return;
    }

    if (sendTo !== undefined &&
        sendTo.length > 0 &&
        this.getLobby().shouldHideGhostChat() &&
        this.getPlayerData().isDead()
    ) {
      const filteredIndices: number[] = [];

      for (let i = 0; i < sendTo.length; i++) {
        if (this.getLobby().findPlayerByConnection(sendTo[i])?.isDead() !== true) {
          filteredIndices.push(i);
        }
      }

      for (let i = filteredIndices.length - 1; i >= 0; i--) {
        sendTo.splice(filteredIndices[i], 1);
      }
    }

    await this.sendRpcPacket(new SendChatPacket(message), sendTo);
  }

  async handleSetScanner(isScanning: boolean, sequenceId: number, sendTo?: Connection[]): Promise<void> {
    if (sequenceId < ++this.scannerSequenceId) {
      return;
    }

    this.scanning = isScanning;

    await this.sendRpcPacket(new SetScannerPacket(isScanning, this.scannerSequenceId), sendTo);
  }

  async handleSendChatNote(playerId: number, chatNoteType: ChatNoteType, sendTo?: Connection[]): Promise<void> {
    const event = new PlayerChatNoteEvent(this.getPlayer(), chatNoteType);

    await this.getLobby().getServer().emit("player.chat.note", event);

    if (event.isCancelled()) {
      return;
    }

    await this.sendRpcPacket(new SendChatNotePacket(playerId, chatNoteType), sendTo);
  }

  async handleUsePlatform(sender: InnerPlayerControl): Promise<void> {
    const shipStatus = this.getLobby().getSafeShipStatus();
    const oldData = shipStatus.getShipStatus().clone();
    const movingPlatform = shipStatus.getShipStatus().getSystems()[InternalSystemType.MovingPlatform] as MovingPlatformSystem;

    if (!movingPlatform.isInUse()) {
      movingPlatform.ride(sender.getParent().getPlayerControl().getNetId());
    }

    await (this.getLobby() as Lobby).sendRootGamePacket(new GameDataPacket([
      shipStatus.getShipStatus().serializeData(oldData),
    ], this.getLobby().getCode()));
  }

  async handleRpc(connection: Connection, type: RpcPacketType, packet: BaseRpcPacket, sendTo: Connection[]): Promise<void> {
    switch (type) {
      case RpcPacketType.PlayAnimation:
        await this.handlePlayAnimation((packet as PlayAnimationPacket).taskType, sendTo);
        break;
      case RpcPacketType.CompleteTask: {
        await this.handleCompleteTask((packet as CompleteTaskPacket).taskIndex, sendTo);
        break;
      }
      case RpcPacketType.SyncSettings:
        await this.handleSyncSettings((packet as SyncSettingsPacket).options, sendTo);
        break;
      case RpcPacketType.SetInfected:
        this.getLobby().getLogger().warn("Received SetInfected packet from connection %s in a server-as-host state", connection);
        break;
      case RpcPacketType.Exiled:
        this.getLobby().getLogger().warn("Received Exiled packet from connection %s in a server-as-host state", connection);
        break;
      case RpcPacketType.CheckName:
        await this.handleCheckName((packet as CheckNamePacket).name);
        break;
      case RpcPacketType.SetName:
        this.getLobby().getLogger().warn("Received SetName packet from connection %s in a server-as-host state", connection);
        break;
      case RpcPacketType.CheckColor:
        await this.handleCheckColor((packet as CheckColorPacket).color);
        break;
      case RpcPacketType.SetColor:
        await this.handleSetColor((packet as SetColorPacket).color);
        break;
      case RpcPacketType.SetHat:
        await this.handleSetHat((packet as SetHatPacket).hat, sendTo);
        break;
      case RpcPacketType.SetSkin:
        await this.handleSetSkin((packet as SetSkinPacket).skin, sendTo);
        break;
      case RpcPacketType.ReportDeadBody:
        // TODO: InnerNetObject refactor
        await this.getLobby().getHostInstance().handleReportDeadBody(this, (packet as ReportDeadBodyPacket).victimPlayerId);
        break;
      case RpcPacketType.MurderPlayer: {
        const data = packet as MurderPlayerPacket;

        await this.handleMurderPlayer(data.victimPlayerControlNetId, sendTo);

        // TODO: InnerNetObject refactor
        await this.getLobby().getHostInstance().handleMurderPlayer(this, data.victimPlayerControlNetId);
        break;
      }
      case RpcPacketType.SendChat:
        await this.handleSendChat((packet as SendChatPacket).message, sendTo);
        break;
      case RpcPacketType.StartMeeting:
        this.getLobby().getLogger().warn("Received StartMeeting packet from connection %s in a server-as-host state", connection);
        break;
      case RpcPacketType.SetScanner: {
        const data = packet as SetScannerPacket;

        await this.handleSetScanner(data.isScanning, data.sequenceId, sendTo);
        break;
      }
      case RpcPacketType.SendChatNote: {
        const data = packet as SendChatNotePacket;

        await this.handleSendChatNote(data.playerId, data.chatNoteType, sendTo);
        break;
      }
      case RpcPacketType.SetPet:
        await this.handleSetPet((packet as SetPetPacket).pet, sendTo);
        break;
      case RpcPacketType.SetStartCounter: {
        // TODO: InnerNetObject refactor
        const data = packet as SetStartCounterPacket;

        await this.getLobby().getHostInstance().handleSetStartCounter(
          this.getLobby().findSafePlayerByClientId(this.getOwnerId()),
          data.sequenceId,
          data.timeRemaining,
        );
        break;
      }
      case RpcPacketType.UsePlatform:
        await this.handleUsePlatform(this);
        break;
      default:
        break;
    }
  }

  getParent(): EntityPlayer {
    return this.parent;
  }

  serializeData(): DataPacket {
    return new DataPacket(
      this.netId,
      new MessageWriter().writeByte(this.playerId),
    );
  }

  serializeSpawn(): SpawnPacketObject {
    return new SpawnPacketObject(
      this.netId,
      new MessageWriter()
        .writeBoolean(this.newPlayer)
        .writeByte(this.playerId),
    );
  }

  clone(): InnerPlayerControl {
    const clone = new InnerPlayerControl(this.parent, this.playerId, this.newPlayer, this.netId);

    clone.scanning = this.scanning;
    clone.scannerSequenceId = this.scannerSequenceId;

    return clone;
  }

  protected getPlayer(): PlayerInstance {
    return this.getLobby().findSafePlayerByPlayerId(this.playerId);
  }

  protected getConnection(): Connection {
    return this.getPlayer().getSafeConnection();
  }

  protected getPlayerData(playerId: number = this.playerId): PlayerData {
    return this.getLobby().getSafeGameData().getGameData().getSafePlayer(playerId);
  }
}
