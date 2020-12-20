import { SpawnInnerNetObject } from "../../packets/gameData/spawn";
import { SystemType } from "../../../types/systemType";
import { BaseShipStatus } from "../baseShipStatus";
import { InnerNetObjectType } from "../types";
import { EntityPolusShipStatus } from ".";

export class InnerPolusShipStatus extends BaseShipStatus<InnerPolusShipStatus, EntityPolusShipStatus> {
  constructor(netId: number, public parent: EntityPolusShipStatus) {
    super(InnerNetObjectType.PolusShipStatus, netId, parent, [
      SystemType.Electrical,
      SystemType.Medbay,
      SystemType.Security,
      SystemType.Communications,
      SystemType.Doors,
      SystemType.Decontamination,
      SystemType.Decontamination2,
      SystemType.Sabotage,
      SystemType.Laboratory,
    ]);
  }

  static spawn(object: SpawnInnerNetObject, parent: EntityPolusShipStatus): InnerPolusShipStatus {
    const planetMap = new InnerPolusShipStatus(object.innerNetObjectID, parent);

    planetMap.setSpawn(object.data);

    return planetMap;
  }

  clone(): InnerPolusShipStatus {
    const clone = new InnerPolusShipStatus(this.id, this.parent);

    clone.systems = this.systems.map(system => system.clone());

    return clone;
  }
}
