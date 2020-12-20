import { CacheDataPacket, AnnouncementDataPacket, FreeWeekendPacket } from "../announcement";
import { MessageReader, MessageWriter } from "../../../util/hazelMessage";
import { AnnouncementPacketType } from "../types/enums";
import { AnnouncementPacketDataType } from "./types";

export class RootAnnouncementPacket {
  constructor(public readonly packets: AnnouncementPacketDataType[]) {}

  static deserialize(reader: MessageReader): RootAnnouncementPacket {
    const packets: AnnouncementPacketDataType[] = [];

    reader.readAllChildMessages(child => {
      switch (child.tag) {
        case AnnouncementPacketType.CacheData:
          packets.push(CacheDataPacket.deserialize(child));
          break;
        case AnnouncementPacketType.AnnouncementData:
          packets.push(AnnouncementDataPacket.deserialize(child));
          break;
        case AnnouncementPacketType.FreeWeekend:
          packets.push(FreeWeekendPacket.deserialize(child));
          break;
      }
    });

    return new RootAnnouncementPacket(packets);
  }

  serialize(): MessageWriter {
    const writer = new MessageWriter();

    for (let i = 0; i < this.packets.length; i++) {
      writer.startMessage(this.packets[i].type)
        .writeBytes(this.packets[i].serialize())
        .endMessage();
    }

    return writer;
  }
}
