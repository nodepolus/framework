import { BaseRpcPacket, SetTasksPacket, UpdateGameDataPacket } from "../../packets/rpc";
import { InnerNetObjectType, RpcPacketType } from "../../../types/enums";
import { DataPacket, SpawnPacketObject } from "../../packets/gameData";
import { MessageWriter } from "../../../util/hazelMessage";
import { BaseInnerNetObject } from "../baseEntity";
import { Connection } from "../../connection";
import { Tasks } from "../../../static";
import { PlayerData } from "./types";
import { EntityGameData } from ".";

export class InnerGameData extends BaseInnerNetObject {
  constructor(
    public readonly parent: EntityGameData,
    public readonly players: PlayerData[] = [],
    netId: number = parent.lobby.getHostInstance().getNextNetId(),
  ) {
    super(InnerNetObjectType.GameData, parent, netId);
  }

  setTasks(playerId: number, taskIds: number[], sendTo?: Connection[]): void {
    const tasks = Tasks.forLevelFromId(this.parent.lobby.getLevel(), taskIds);
    const playerIndex = this.players.findIndex(p => p.id == playerId);

    if (playerIndex > -1) {
      const player = this.players[playerIndex];

      player.tasks = new Array(tasks.length);

      for (let j = 0; j < tasks.length; j++) {
        player.tasks[j] = [
          tasks[j],
          false,
        ];
      }
    }

    this.sendRpcPacket(new SetTasksPacket(playerId, taskIds), sendTo);
  }

  updateGameData(playerData: PlayerData[], sendTo?: Connection[]): void {
    for (let i = 0; i < playerData.length; i++) {
      let hasPlayer = false;

      for (let j = 0; j < this.players.length; j++) {
        if (this.players[j].id == playerData[i].id) {
          hasPlayer = true;
          this.players[j] = playerData[i];

          break;
        }
      }

      if (!hasPlayer) {
        this.players.push(playerData[i]);
      }
    }

    this.sendRpcPacket(new UpdateGameDataPacket(playerData), sendTo);
  }

  handleRpc(connection: Connection, type: RpcPacketType, _packet: BaseRpcPacket, _sendTo: Connection[]): void {
    switch (type) {
      case RpcPacketType.SetTasks:
        this.parent.lobby.getLogger().warn("Received SetTasks packet from connection %s in a server-as-host state", connection);
        break;
      case RpcPacketType.UpdateGameData:
        break;
      default:
        break;
    }
  }

  // TODO: compare players and only send those that have updated
  serializeData(): DataPacket {
    return new DataPacket(
      this.netId,
      new MessageWriter().writeList(this.players, (sub, player) => player.serialize(sub), false),
    );
  }

  serializeSpawn(): SpawnPacketObject {
    return new SpawnPacketObject(
      this.netId,
      new MessageWriter().writeList(this.players, (sub, player) => player.serialize(sub)),
    );
  }

  clone(): InnerGameData {
    return new InnerGameData(this.parent, this.players, this.netId);
  }
}
