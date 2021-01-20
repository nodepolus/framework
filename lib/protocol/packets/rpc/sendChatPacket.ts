import { MessageReader, MessageWriter } from "../../../util/hazelMessage";
import { RPCPacketType } from "../types/enums";
import { BaseRPCPacket } from ".";

/**
 * RPC Packet ID: `0x0d` (`13`)
 */
export class SendChatPacket extends BaseRPCPacket {
  constructor(
    public readonly message: string,
  ) {
    super(RPCPacketType.SendChat);
  }

  static deserialize(reader: MessageReader): SendChatPacket {
    return new SendChatPacket(reader.readString());
  }

  serialize(): MessageWriter {
    return new MessageWriter().writeString(this.message);
  }
}
