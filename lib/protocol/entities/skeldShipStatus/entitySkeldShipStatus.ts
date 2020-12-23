import { BaseEntityShipStatus } from "../baseShipStatus/baseEntityShipStatus";
import { SpawnPacket } from "../../packets/gameData";
import { SpawnType } from "../../../types/enums";
import { LobbyImplementation } from "../types";
import { InnerSkeldShipStatus } from ".";

export class EntitySkeldShipStatus extends BaseEntityShipStatus {
  constructor(lobby: LobbyImplementation, shipStatusNetId: number) {
    super(SpawnType.ShipStatus, lobby);

    this.shipStatus = new InnerSkeldShipStatus(shipStatusNetId, this);
  }

  serializeSpawn(): SpawnPacket {
    return new SpawnPacket(
      this.type,
      this.owner,
      this.flags,
      [
        this.getShipStatus().serializeSpawn(),
      ],
    );
  }
}
