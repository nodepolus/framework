import { MessageReader, MessageWriter } from "../../../../../util/hazelMessage";
import { BaseRPCPacket } from "../../../basePacket";
import { RPCPacketType } from "../../../types";

export class ReportDeadBodyPacket extends BaseRPCPacket {
  constructor(readonly victimPlayerId?: number) {
    super(RPCPacketType.ReportDeadBody);
  }

  static deserialize(reader: MessageReader): ReportDeadBodyPacket {
    const victimPlayerId = reader.readByte();

    return new ReportDeadBodyPacket(victimPlayerId == 0xff ? undefined : victimPlayerId);
  }

  serialize(): MessageWriter {
    return new MessageWriter().writeByte(this.victimPlayerId ?? 0xff);
  }
}