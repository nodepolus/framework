import { SpawnInnerNetObject, SpawnPacket } from "../../packets/gameData/spawn";
import { InnerSkeldShipStatus } from "./innerSkeldShipStatus";
import { SpawnFlag } from "../../../types/spawnFlag";
import { SpawnType } from "../../../types/spawnType";
import { LobbyImplementation } from "../types";
import { BaseEntity } from "../baseEntity";

export type SkeldShipStatusInnerNetObjects = [ InnerSkeldShipStatus ];

export class EntitySkeldShipStatus extends BaseEntity {
  public owner!: number;
  public flags: SpawnFlag = SpawnFlag.None;
  public innerNetObjects!: SkeldShipStatusInnerNetObjects;

  get shipStatus(): InnerSkeldShipStatus {
    return this.innerNetObjects[0];
  }

  constructor(lobby: LobbyImplementation) {
    super(SpawnType.ShipStatus, lobby);
  }

  static spawn(flags: SpawnFlag, owner: number, innerNetObjects: SpawnInnerNetObject[], lobby: LobbyImplementation): EntitySkeldShipStatus {
    const shipStatus = new EntitySkeldShipStatus(lobby);

    shipStatus.setSpawn(flags, owner, innerNetObjects);

    return shipStatus;
  }

  getSpawn(): SpawnPacket {
    return new SpawnPacket(
      this.type,
      this.owner,
      this.flags,
      [
        this.shipStatus.spawn(),
      ],
    );
  }

  setSpawn(_flags: SpawnFlag, owner: number, innerNetObjects: SpawnInnerNetObject[]): void {
    this.owner = owner;
    this.innerNetObjects = [
      InnerSkeldShipStatus.spawn(innerNetObjects[0], this),
    ];
  }
}
