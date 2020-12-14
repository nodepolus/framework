import { EnterVentPacket } from "../../packets/rootGamePackets/gameDataPackets/rpcPackets/enterVent";
import { ExitVentPacket } from "../../packets/rootGamePackets/gameDataPackets/rpcPackets/exitVent";
import { SpawnInnerNetObject } from "../../packets/rootGamePackets/gameDataPackets/spawn";
import { DataPacket } from "../../packets/rootGamePackets/gameDataPackets/data";
import { MessageReader, MessageWriter } from "../../../util/hazelMessage";
import { BaseGameObject } from "../baseEntity";
import { Connection } from "../../connection";
import { InnerNetObjectType } from "../types";
import { EntityPlayer } from ".";

export class InnerPlayerPhysics extends BaseGameObject<InnerPlayerPhysics> {
  constructor(netId: number, public parent: EntityPlayer) {
    super(InnerNetObjectType.PlayerPhysics, netId, parent);
  }

  static spawn(object: SpawnInnerNetObject, parent: EntityPlayer): InnerPlayerPhysics {
    const playerPhysics = new InnerPlayerPhysics(object.innerNetObjectID, parent);

    playerPhysics.setSpawn(object.data);

    return playerPhysics;
  }

  enterVent(ventId: number, sendTo: Connection[]): void {
    this.sendRPCPacketTo(sendTo, new EnterVentPacket(ventId));
  }

  exitVent(ventId: number, sendTo: Connection[]): void {
    this.sendRPCPacketTo(sendTo, new ExitVentPacket(ventId));
  }

  getData(): DataPacket {
    return new DataPacket(this.id, new MessageWriter());
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setData(_packet: MessageReader | MessageWriter): void {}

  getSpawn(): SpawnInnerNetObject {
    return new DataPacket(
      this.id,
      new MessageWriter().startMessage(1).endMessage(),
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setSpawn(_data: MessageReader | MessageWriter): void {}

  clone(): InnerPlayerPhysics {
    return new InnerPlayerPhysics(this.id, this.parent);
  }
}
