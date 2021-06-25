import { BaseRpcPacket, ClimbLadderPacket, EnterVentPacket, ExitVentPacket } from "../../packets/rpc";
import { GameVentEnteredEvent, GameVentExitedEvent } from "../../../api/events/game";
import { InnerNetObjectType, RpcPacketType } from "../../../types/enums";
import { DataPacket, SpawnPacketObject } from "../../packets/gameData";
import { MessageWriter } from "../../../util/hazelMessage";
import { BaseInnerNetObject } from "../baseEntity";
import { Connection } from "../../connection";
import { LevelVent } from "../../../types";
import { Vents } from "../../../static";
import { EntityPlayer } from ".";

export class InnerPlayerPhysics extends BaseInnerNetObject {
  protected vent?: LevelVent;
  protected lastLadderSequenceId = -1;

  constructor(
    protected readonly parent: EntityPlayer,
    netId: number = parent.getLobby().getHostInstance().getNextNetId(),
  ) {
    super(InnerNetObjectType.PlayerPhysics, parent, netId);
  }

  getVent(): LevelVent | undefined {
    return this.vent;
  }

  async handleEnterVent(vent: LevelVent | undefined, sendTo?: Connection[]): Promise<void> {
    if (vent === undefined) {
      return;
    }

    const player = this.parent.getLobby().findSafePlayerByNetId(this.netId);
    const event = new GameVentEnteredEvent(
      this.parent.getLobby().getSafeGame(),
      player,
      vent,
    );

    await this.parent.getLobby().getServer().emit("game.vent.entered", event);

    if (event.isCancelled()) {
      const connection = player.getConnection();

      if (connection !== undefined) {
        // TODO: Add delay
        await this.sendRpcPacket(new ExitVentPacket(vent.getId()), [connection]);
      }

      return;
    }

    this.vent = vent;

    await this.sendRpcPacket(new EnterVentPacket(vent.getId()), sendTo);
  }

  async handleExitVent(vent: LevelVent | undefined, sendTo?: Connection[]): Promise<void> {
    if (vent === undefined) {
      return;
    }

    const player = this.parent.getLobby().findSafePlayerByNetId(this.netId);
    const event = new GameVentExitedEvent(
      this.parent.getLobby().getSafeGame(),
      player,
      vent,
    );

    await this.parent.getLobby().getServer().emit("game.vent.exited", event);

    if (event.isCancelled()) {
      const connection = player.getConnection();

      if (connection !== undefined) {
        // TODO: Add delay
        await this.sendRpcPacket(new EnterVentPacket(vent.getId()), [connection]);
      }

      return;
    }

    this.vent = undefined;

    await this.sendRpcPacket(new ExitVentPacket(vent.getId()), sendTo);
  }

  async handleClimbLadder(ladder: number, sequenceId: number, sendTo?: Connection[]): Promise<void> {
    const wrap = (this.lastLadderSequenceId + 127) % 256;
    let isOldSidGreaterThanSid = false;

    if (this.lastLadderSequenceId < wrap) {
      isOldSidGreaterThanSid = sequenceId > this.lastLadderSequenceId && sequenceId <= wrap;
    } else {
      isOldSidGreaterThanSid = sequenceId > this.lastLadderSequenceId || sequenceId <= wrap;
    }

    if (!isOldSidGreaterThanSid) {
      return;
    }

    await this.sendRpcPacket(new ClimbLadderPacket(ladder, sequenceId), sendTo);
  }

  handleRpc(connection: Connection, type: RpcPacketType, packet: BaseRpcPacket, sendTo: Connection[]): void {
    switch (type) {
      case RpcPacketType.EnterVent:
        this.handleEnterVent(Vents.forLevelFromId(this.parent.getLobby().getLevel(), (packet as EnterVentPacket).ventId), sendTo);
        break;
      case RpcPacketType.ExitVent:
        this.handleExitVent(Vents.forLevelFromId(this.parent.getLobby().getLevel(), (packet as ExitVentPacket).ventId), sendTo);
        break;
      case RpcPacketType.ClimbLadder: {
        const data = packet as ClimbLadderPacket;

        this.handleClimbLadder(data.ladderId, data.sequenceId, sendTo);
        break;
      }
      default:
        break;
    }
  }

  getParent(): EntityPlayer {
    return this.parent;
  }

  serializeData(): DataPacket {
    return new DataPacket(this.netId, new MessageWriter());
  }

  serializeSpawn(): SpawnPacketObject {
    return new SpawnPacketObject(
      this.netId,
      new MessageWriter(),
    );
  }

  clone(): InnerPlayerPhysics {
    const clone = new InnerPlayerPhysics(this.parent, this.netId);

    clone.vent = this.vent;

    return clone;
  }
}
