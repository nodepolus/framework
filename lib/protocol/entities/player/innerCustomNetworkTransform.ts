import { PlayerPositionTeleportedEvent, PlayerPositionWalkedEvent } from "../../../api/events/player";
import { InnerNetObjectType, TeleportReason } from "../../../types/enums";
import { MessageReader, MessageWriter } from "../../../util/hazelMessage";
import { DataPacket, SpawnPacketObject } from "../../packets/gameData";
import { BaseInnerNetObject } from "../baseEntity";
import { SnapToPacket } from "../../packets/rpc";
import { Connection } from "../../connection";
import { Vector2 } from "../../../types";
import { EntityPlayer } from ".";

export class InnerCustomNetworkTransform extends BaseInnerNetObject {
  constructor(
    netId: number,
    public readonly parent: EntityPlayer,
    public sequenceId: number,
    public position: Vector2,
    public velocity: Vector2,
  ) {
    super(InnerNetObjectType.CustomNetworkTransform, netId, parent);
  }

  async snapTo(position: Vector2, sendTo: Connection[], reason: TeleportReason): Promise<void> {
    const player = this.parent.lobby.findPlayerByNetId(this.netId);

    if (!player) {
      throw new Error(`InnerNetObject ${this.netId} does not have a PlayerInstance on the lobby instance`);
    }

    this.sequenceId += 5;

    const event = new PlayerPositionTeleportedEvent(player, this.position, this.velocity, position, Vector2.zero(), reason);

    await this.parent.lobby.getServer().emit("player.position.updated", event);
    await this.parent.lobby.getServer().emit("player.position.teleported", event);

    if (event.isCancelled()) {
      const connection = player.getConnection();

      if (connection) {
        this.sendRpcPacket(new SnapToPacket(this.position, this.sequenceId += 5), [connection]);
      }

      return;
    }

    this.position = event.getNewPosition();
    this.velocity = event.getNewVelocity();

    this.sendRpcPacket(new SnapToPacket(this.position, this.sequenceId), sendTo);
  }

  serializeData(): DataPacket {
    return new DataPacket(
      this.netId,
      new MessageWriter()
        .writeUInt16(this.sequenceId)
        .writeVector2(this.position)
        .writeVector2(this.velocity),
    );
  }

  async setData(packet: MessageReader | MessageWriter): Promise<void> {
    const player = this.parent.lobby.findPlayerByNetId(this.netId);

    if (!player) {
      throw new Error(`InnerNetObject ${this.netId} does not have a PlayerInstance on the lobby instance`);
    }

    const reader = MessageReader.fromRawBytes(packet.getBuffer());

    this.sequenceId = reader.readUInt16();

    const position = reader.readVector2();
    const velocity = reader.readVector2();
    const event = new PlayerPositionWalkedEvent(player, this.position, this.velocity, position, velocity);

    await this.parent.lobby.getServer().emit("player.position.updated", event);
    await this.parent.lobby.getServer().emit("player.position.walked", event);

    if (event.isCancelled()) {
      const connection = player.getConnection();

      if (connection) {
        this.sendRpcPacket(new SnapToPacket(this.position, this.sequenceId += 5), [connection]);
      }

      return;
    }

    this.position = event.getNewPosition();
    this.velocity = event.getNewVelocity();
  }

  serializeSpawn(): SpawnPacketObject {
    return new SpawnPacketObject(
      this.netId,
      new MessageWriter()
        .writeUInt16(this.sequenceId)
        .writeVector2(this.position)
        .writeVector2(this.velocity),
    );
  }

  clone(): InnerCustomNetworkTransform {
    return new InnerCustomNetworkTransform(this.netId, this.parent, this.sequenceId, this.position, this.velocity);
  }
}
