import { InnerNetObjectType, SystemType } from "../../../../types/enums";
import { BaseInnerShipStatus } from "../baseShipStatus";
import { EntityMiraShipStatus } from ".";

export class InnerMiraShipStatus extends BaseInnerShipStatus {
  constructor(
    public readonly parent: EntityMiraShipStatus,
    netId: number = parent.lobby.getHostInstance().getNextNetId(),
  ) {
    super(InnerNetObjectType.MiraShipStatus, parent, [
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
    ], netId);
  }

  clone(): InnerMiraShipStatus {
    const clone = new InnerMiraShipStatus(this.parent, this.netId);

    clone.systems = this.systems.map(system => system.clone());

    return clone;
  }
}
