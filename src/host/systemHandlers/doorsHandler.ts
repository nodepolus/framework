import { BaseInnerShipStatus } from "../../protocol/entities/shipStatus/baseShipStatus";
import { DoorsSystem } from "../../protocol/entities/shipStatus/systems";
import { GameDataPacket } from "../../protocol/packets/root";
import { SystemType } from "../../types/enums";
import { Doors } from "../../static";
import { Host } from "..";

export class DoorsHandler {
  protected readonly systemTimers: NodeJS.Timeout[] = [];

  protected oldShipStatus: BaseInnerShipStatus;

  constructor(
    protected host: Host,
    protected shipStatus: BaseInnerShipStatus,
  ) {
    this.oldShipStatus = shipStatus.clone();
  }

  async closeDoor(doorIds: number | number[]): Promise<void> {
    this.setOldShipStatus();

    const doorsSystem = this.shipStatus.getSystemFromType(SystemType.Doors) as DoorsSystem;

    if (doorIds instanceof Array) {
      for (let i = 0; i < doorIds.length; i++) {
        const id = doorIds[i];

        doorsSystem.setDoorState(id, false);
      }
    } else {
      doorsSystem.setDoorState(doorIds, false);
    }

    await this.sendDataUpdate();
  }

  async setSystemTimeout(systemId: SystemType, time: number): Promise<void> {
    this.setOldShipStatus();

    const doorsSystem = this.shipStatus.getSystemFromType(SystemType.Doors) as DoorsSystem;

    doorsSystem.setTimer(systemId, time);

    this.systemTimers[systemId] = setInterval(() => {
      let currentTime = doorsSystem.getTimer(systemId);

      if (currentTime !== undefined && currentTime != 0) {
        doorsSystem.setTimer(systemId, --currentTime);
      } else {
        clearInterval(this.systemTimers[systemId]);
        this.systemTimers.splice(systemId, 1);
      }
    }, 1000);

    await this.sendDataUpdate();
  }

  getDoorsForSystem(systemId: SystemType): number[] {
    const doors = Doors.forLevel(this.host.getLobby().getLevel())[systemId];

    if (doors === undefined) {
      throw new Error(`SystemType ${systemId} (${SystemType[systemId]}) does not have any doors`);
    }

    return doors as number[];
  }

  setOldShipStatus(): this {
    this.oldShipStatus = this.shipStatus.clone();

    return this;
  }

  async sendDataUpdate(): Promise<void> {
    await this.host.getLobby().sendRootGamePacket(new GameDataPacket([
      this.shipStatus.serializeData(this.oldShipStatus),
    ], this.host.getLobby().getCode()));
  }

  clearTimers(): void {
    for (let i = 0; i < this.systemTimers.length; i++) {
      clearInterval(this.systemTimers[i]);
    }

    this.systemTimers.splice(0, this.systemTimers.length);
  }
}
