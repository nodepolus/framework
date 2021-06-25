import { PlayerPositionTeleportedEvent, PlayerPositionWalkedEvent } from "../../../api/events/player";
import { InnerNetObjectType, RpcPacketType, TeleportReason } from "../../../types/enums";
import { MessageReader, MessageWriter } from "../../../util/hazelMessage";
import { DataPacket, SpawnPacketObject } from "../../packets/gameData";
import { BaseRpcPacket, SnapToPacket } from "../../packets/rpc";
import { GameDataPacket } from "../../packets/root";
import { BaseInnerNetObject } from "../baseEntity";
import { MaxValue } from "../../../util/constants";
import { Connection } from "../../connection";
import { Vector2 } from "../../../types";
import { Lobby } from "../../../lobby";
import { EntityPlayer } from ".";

export class InnerCustomNetworkTransform extends BaseInnerNetObject {
  constructor(
    protected readonly parent: EntityPlayer,
    protected position: Vector2 = Vector2.zero(),
    protected velocity: Vector2 = Vector2.zero(),
    protected sequenceId: number = 5,
    netId: number = parent.getLobby().getHostInstance().getNextNetId(),
  ) {
    super(InnerNetObjectType.CustomNetworkTransform, parent, netId);
  }

  getPosition(): Vector2 {
    return this.position;
  }

  setPosition(position: Vector2): this {
    this.position = position;

    return this;
  }

  getVelocity(): Vector2 {
    return this.velocity;
  }

  setVelocity(velocity: Vector2): this {
    this.velocity = velocity;

    return this;
  }

  async walkTo(position: Vector2, velocity: Vector2 = Vector2.zero()): Promise<void> {
    this.setPosition(position);
    this.setVelocity(velocity);
    this.incrementSequenceId(1);
    await (this.parent.getLobby() as Lobby).sendRootGamePacket(new GameDataPacket([
      this.serializeData(),
    ], this.parent.getLobby().getCode()));
  }

  getSequenceId(): number {
    return this.sequenceId;
  }

  async handleSnapTo(position: Vector2, reason: TeleportReason, sendTo?: Connection[]): Promise<void> {
    const player = this.parent.getLobby().findSafePlayerByNetId(this.netId);

    this.incrementSequenceId(5);

    const event = new PlayerPositionTeleportedEvent(player, this.position, this.velocity, position, Vector2.zero(), reason);

    await this.parent.getLobby().getServer().emit("player.position.updated", event);
    await this.parent.getLobby().getServer().emit("player.position.teleported", event);

    if (event.isCancelled()) {
      const connection = player.getConnection();

      if (connection !== undefined) {
        await this.sendRpcPacket(new SnapToPacket(this.position, this.incrementSequenceId(5)), [connection]);
      }

      return;
    }

    this.position = event.getNewPosition();
    this.velocity = event.getNewVelocity();

    await this.sendRpcPacket(new SnapToPacket(this.position, this.sequenceId), sendTo);
  }

  handleRpc(connection: Connection, type: RpcPacketType, packet: BaseRpcPacket, sendTo: Connection[]): void {
    switch (type) {
      case RpcPacketType.SnapTo:
        this.handleSnapTo((packet as SnapToPacket).position, TeleportReason.Unknown, sendTo);
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
      new MessageWriter()
        .writeUInt16(this.sequenceId)
        .writeVector2(this.position)
        .writeVector2(this.velocity),
    );
  }

  async setData(packet: MessageReader | MessageWriter): Promise<void> {
    const player = this.parent.getLobby().findSafePlayerByNetId(this.netId);
    const reader = MessageReader.fromRawBytes(packet.getBuffer());
    const sequenceId = reader.readUInt16();

    if (!this.isSequenceIdGreater(sequenceId)) {
      return;
    }

    this.sequenceId = sequenceId;

    const position = reader.readVector2();
    const velocity = reader.readVector2();
    const event = new PlayerPositionWalkedEvent(player, this.position, this.velocity, position, velocity);

    await this.parent.getLobby().getServer().emit("player.position.updated", event);
    await this.parent.getLobby().getServer().emit("player.position.walked", event);

    if (event.isCancelled()) {
      const connection = player.getConnection();

      if (connection !== undefined) {
        await this.sendRpcPacket(new SnapToPacket(this.position, this.incrementSequenceId(5)), [connection]);
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
    return new InnerCustomNetworkTransform(this.parent, this.position, this.velocity, this.sequenceId, this.netId);
  }

  protected incrementSequenceId(amount: number): number {
    this.sequenceId = (this.sequenceId + Math.abs(amount)) % (MaxValue.UInt16 + 1);

    return this.sequenceId;
  }

  protected isSequenceIdGreater(sequenceId: number): boolean {
    const max = this.sequenceId + 32767;

    if (this.sequenceId < max) {
      if (sequenceId > this.sequenceId) {
        return sequenceId <= max;
      }

      return false;
    }

    if (sequenceId <= this.sequenceId) {
      return sequenceId <= max;
    }

    return true;
  }
}
