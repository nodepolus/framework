import { InnerNetObjectType } from "../types/enums";
import { BaseShipStatus } from "../baseShipStatus";
import { SystemType } from "../../../types/enums";
import { EntityMiraShipStatus } from ".";

export class InnerMiraShipStatus extends BaseShipStatus {
  constructor(
    netId: number,
    public parent: EntityMiraShipStatus,
  ) {
    super(InnerNetObjectType.MiraShipStatus, netId, parent, [
      SystemType.Reactor,
      SystemType.Electrical,
      SystemType.Oxygen,
      SystemType.Medbay,
      SystemType.Communications,
      SystemType.Sabotage,
      SystemType.Decontamination,
    ], [
      SystemType.Reactor,
      SystemType.Electrical,
      SystemType.Oxygen,
      SystemType.Medbay,
      SystemType.Communications,
      SystemType.Sabotage,
    ]);
  }

  clone(): InnerMiraShipStatus {
    const clone = new InnerMiraShipStatus(this.netId, this.parent);

    clone.systems = this.systems.map(system => system.clone());

    return clone;
  }
}
