import { MessageReader, MessageWriter } from "../../../util/hazelMessage";
import { BaseGameDataPacket } from "./baseGameDataPacket";
import { GameDataPacketType } from "../types/enums";

export class ReadyPacket extends BaseGameDataPacket {
  constructor(
    public playerClientID: number,
  ) {
    super(GameDataPacketType.Ready);
  }

  static deserialize(reader: MessageReader): ReadyPacket {
    return new ReadyPacket(reader.readPackedUInt32());
  }

  serialize(): MessageWriter {
    return new MessageWriter().writePackedUInt32(this.playerClientID);
  }
}