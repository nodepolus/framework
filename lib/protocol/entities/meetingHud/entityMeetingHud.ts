import { BaseInnerNetEntity, LobbyImplementation } from "../types";
import { SpawnFlag, SpawnType } from "../../../types/enums";
import { GLOBAL_OWNER } from "../../../util/constants";
import { SpawnPacket } from "../../packets/gameData";
import { InnerMeetingHud } from ".";

export class EntityMeetingHud extends BaseInnerNetEntity {
  public innerNetObjects: [ InnerMeetingHud ];

  get meetingHud(): InnerMeetingHud {
    return this.innerNetObjects[0];
  }

  constructor(lobby: LobbyImplementation, meetingHudNetId: number) {
    super(SpawnType.MeetingHud, lobby, GLOBAL_OWNER, SpawnFlag.None);

    this.innerNetObjects = [
      new InnerMeetingHud(meetingHudNetId, this),
    ];
  }

  serializeSpawn(): SpawnPacket {
    return new SpawnPacket(
      SpawnType.MeetingHud,
      GLOBAL_OWNER,
      SpawnFlag.None,
      [
        this.meetingHud.serializeSpawn(),
      ],
    );
  }
}
