import { MessageWriter, MessageReader } from "../../../../util/hazelMessage";
import { BaseGameDataPacket } from "../../basePacket";
import { GameDataPacketType } from "../../types";

export class DataPacket extends BaseGameDataPacket {
  constructor(public innerNetObjectID: number, public data: MessageReader | MessageWriter) {
    super(GameDataPacketType.Data);
  }

  static deserialize(reader: MessageReader): DataPacket {
    return new DataPacket(
      reader.readPackedUInt32(),
      reader.readRemainingBytes(),
    );
  }

  serialize(): MessageWriter {
    return new MessageWriter()
      .writePackedUInt32(this.innerNetObjectID)
      .writeBytes(this.data);
  }
}
