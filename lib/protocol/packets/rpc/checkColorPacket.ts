import { MessageReader, MessageWriter } from "../../../util/hazelMessage";
import { PlayerColor } from "../../../types/enums";
import { RPCPacketType } from "../types/enums";
import { BaseRPCPacket } from ".";

/**
 * RPC Packet ID: `0x07` (`7`)
 */
export class CheckColorPacket extends BaseRPCPacket {
  constructor(
    public readonly color: PlayerColor,
  ) {
    super(RPCPacketType.CheckColor);
  }

  static deserialize(reader: MessageReader): CheckColorPacket {
    return new CheckColorPacket(reader.readByte());
  }

  serialize(): MessageWriter {
    return new MessageWriter().writeByte(this.color);
  }
}
