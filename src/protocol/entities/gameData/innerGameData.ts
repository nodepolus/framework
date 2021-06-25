import { InnerNetObjectType, PlayerColor, RpcPacketType } from "../../../types/enums";
import { DataPacket, SpawnPacketObject } from "../../packets/gameData";
import { BaseRpcPacket, SetTasksPacket } from "../../packets/rpc";
import { MessageWriter } from "../../../util/hazelMessage";
import { GameDataPacket } from "../../packets/root";
import { BaseInnerNetObject } from "../baseEntity";
import { Connection } from "../../connection";
import { Tasks } from "../../../static";
import { PlayerData } from "./types";
import { EntityGameData } from ".";

export class InnerGameData extends BaseInnerNetObject {
  constructor(
    protected readonly parent: EntityGameData,
    protected players: Map<number, PlayerData> = new Map(),
    netId: number = parent.getLobby().getHostInstance().getNextNetId(),
  ) {
    super(InnerNetObjectType.GameData, parent, netId);
  }

  getPlayers(sorted: boolean = true): Map<number, PlayerData> {
    return sorted ? new Map([...this.players.entries()].sort((a, b) => a[0] - b[0])) : this.players;
  }

  setPlayers(players: Map<number, PlayerData>): void {
    this.players = players;
  }

  getPlayer(playerId: number): PlayerData | undefined {
    return this.players.get(playerId);
  }

  getSafePlayer(playerId: number): PlayerData {
    const player = this.getPlayer(playerId);

    if (player === undefined) {
      throw new Error(`GameData does not have PlayerData for player ${playerId}`);
    }

    return player;
  }

  addPlayer(playerData: PlayerData): void {
    this.players.set(playerData.getId(), playerData);
  }

  removePlayer(playerId: number): void {
    this.players.delete(playerId);
  }

  /**
   * Gets whether or not the given name is already in use by another player.
   *
   * @param name - The name to be checked
   * @param excludePlayerId - The ID of the player whose name will be excluded from the check
   * @returns `true` if the name is already in use, `false` if not
   */
  isNameTaken(name: string, excludePlayerId?: number): boolean {
    const players = new Set(this.parent.getLobby().getRealPlayers().map(p => p.getId()));
    const playerData = [...this.players.values()];

    for (let i = 0; i < playerData.length; i++) {
      const player = playerData[i];

      if (player.getId() === excludePlayerId) {
        continue;
      }

      if (!players.has(player.getId())) {
        continue;
      }

      if (player.getName().toLocaleLowerCase() === name.toLocaleLowerCase()) {
        return true;
      }
    }

    return false;
  }

  /**
   * Gets all colors that are already in use by other players.
   *
   * @param excludePlayerId - The ID of the player whose color will be excluded from the results
   * @returns The colors that are already in use
   */
  getTakenColors(excludePlayerId?: number): Set<PlayerColor> {
    const players = new Set(this.parent.getLobby().getRealPlayers().map(p => p.getId()));
    const playerData = [...this.players.values()];
    const takenColors: Set<PlayerColor> = new Set();

    for (let i = 0; i < playerData.length; i++) {
      const player = playerData[i];

      if (player.getId() === excludePlayerId) {
        continue;
      }

      if (!players.has(player.getId())) {
        continue;
      }

      takenColors.add(player.getColor());
    }

    return takenColors;
  }

  async setTasks(playerId: number, taskIds: number[], sendTo?: Connection[]): Promise<void> {
    const tasks = Tasks.forLevelFromId(this.parent.getLobby().getLevel(), taskIds);
    const player = this.players.get(playerId);

    if (player !== undefined) {
      const newTasks = new Array(tasks.length);

      for (let j = 0; j < tasks.length; j++) {
        newTasks[j] = [
          tasks[j],
          false,
        ];
      }

      player.setTasks(newTasks);
    }

    await this.sendRpcPacket(new SetTasksPacket(playerId, taskIds), sendTo);
  }

  async updateAllGameData(sendTo?: Connection[]): Promise<void> {
    return await this.updateGameData(undefined, sendTo);
  }

  async updateGameData(playerData?: PlayerData[], sendTo?: Connection[]): Promise<void> {
    playerData ??= [...this.players.values()];

    for (let i = 0; i < playerData.length; i++) {
      const player = playerData[i];

      this.players.set(player.getId(), player);
    }

    await this.getLobby().sendRootGamePacket(
      new GameDataPacket([this.serializeData()], this.getLobby().getCode()),
      sendTo ?? this.getLobby().getConnections(),
    );
  }

  handleRpc(connection: Connection, type: RpcPacketType, _packet: BaseRpcPacket, _sendTo: Connection[]): void {
    switch (type) {
      case RpcPacketType.SetTasks:
        this.parent.getLobby().getLogger().warn("Received SetTasks packet from connection %s in a server-as-host state", connection);
        break;
      default:
        break;
    }
  }

  getParent(): EntityGameData {
    return this.parent;
  }

  // TODO: compare players and only send those that have updated
  serializeData(): DataPacket {
    return new DataPacket(
      this.netId,
      new MessageWriter().writeListWithoutLength(this.players.values(), (sub, player) => {
        sub.startMessage(player.getId()).writeObject(player).endMessage();
      }),
    );
  }

  serializeSpawn(): SpawnPacketObject {
    return new SpawnPacketObject(
      this.netId,
      new MessageWriter().writeList(this.players.values(), (sub, player) => {
        sub.writeByte(player.getId()).writeObject(player);
      }),
    );
  }

  clone(): InnerGameData {
    return new InnerGameData(this.parent, new Map(Array.from(this.players, ([id, data]) => [id, data.clone()])), this.netId);
  }
}
