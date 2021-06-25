import { DeconSystem, DeconTwoSystem } from "../../protocol/entities/shipStatus/systems";
import { DecontaminationDoorState } from "../../types/enums";
import { Host } from "..";

export class DecontaminationHandler {
  protected timer?: NodeJS.Timeout;

  constructor(
    protected host: Host,
    protected system: DeconSystem | DeconTwoSystem,
  ) {}

  update(): void {
    this.system.decrementTimer();

    if (this.system.getTimer() == 0) {
      this.system.setTimer(3);

      const state = this.system.getState();

      if ((state & DecontaminationDoorState.Enter) == DecontaminationDoorState.Enter) {
        this.system.setState((state & ~DecontaminationDoorState.Enter) | DecontaminationDoorState.Closed);

        return;
      }

      if ((state & DecontaminationDoorState.Closed) == DecontaminationDoorState.Closed) {
        this.system.setState((state & ~DecontaminationDoorState.Closed) | DecontaminationDoorState.Exit);

        return;
      }

      if ((state & DecontaminationDoorState.Exit) == DecontaminationDoorState.Exit) {
        this.system.setState(DecontaminationDoorState.Idle);
        this.system.setTimer(0);
        this.clearTimer();
      }
    }
  }

  async start(from: DecontaminationDoorState): Promise<void> {
    const systemsHandler = this.host.getSystemsHandler();

    if (systemsHandler === undefined) {
      throw new Error("Attempted to decontaminate without a SystemsHandler instance");
    }

    this.system.setState(from);
    this.system.setTimer(3);

    this.timer = setInterval(() => {
      systemsHandler.setOldShipStatus();
      this.update();
      systemsHandler.sendDataUpdate();
    }, 1000);

    systemsHandler.setOldShipStatus();
    this.update();
    await systemsHandler.sendDataUpdate();
  }

  clearTimer(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      delete this.timer;
    }
  }
}
