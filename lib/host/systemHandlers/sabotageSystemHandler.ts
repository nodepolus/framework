import { GameOverReason, Level } from "../../types/enums";
import { Bitfield } from "../../types";
import { InternalHost } from "..";
import {
  HqHudSystem,
  HudOverrideSystem,
  LaboratorySystem,
  LifeSuppSystem,
  ReactorSystem,
  SwitchSystem,
} from "../../protocol/entities/shipStatus/systems";

export class SabotageSystemHandler {
  // TODO: Make protected with getter/setter
  public timer?: NodeJS.Timeout;

  constructor(
    protected host: InternalHost,
  ) {}

  sabotageReactor(system: ReactorSystem | LaboratorySystem): void {
    switch (this.host.getLobby().getLevel()) {
      case Level.TheSkeld:
      case Level.AprilSkeld:
        system.setTimer(30);
        break;
      case Level.MiraHq:
        system.setTimer(45);
        break;
      case Level.Polus:
        system.setTimer(60);
        break;
      case Level.Airship:
        system.setTimer(100);
        break;
    }

    this.timer = setInterval(() => {
      system.decrementTimer();

      if (system.getTimer() <= 0) {
        this.host.endGame(GameOverReason.ImpostorsBySabotage);

        if (this.timer) {
          clearInterval(this.timer);
        }
      }
    }, 1000);
  }

  sabotageCommunications(system: HudOverrideSystem | HqHudSystem): void {
    if (system instanceof HudOverrideSystem) {
      system.setSabotaged(true);
    } else {
      system.clearActiveConsoles();
      system.clearCompletedConsoles();
    }
  }

  sabotageElectrical(system: SwitchSystem): void {
    system.setExpectedSwitches(new Bitfield(new Array(5).fill(false).map(() => Math.random() < 0.5)));
    system.setActualSwitches(system.getExpectedSwitches().clone());

    const expected = system.getExpectedSwitches();
    const actual = system.getActualSwitches();

    for (let i = 0; i < expected.getSize(); i++) {
      const pos = Math.floor(Math.random() * (expected.getSize() - i)) * i;

      actual.update(pos, !expected.has(pos));
    }

    // TODO: Actually count down like every other system (like -85 every second)
    setTimeout(() => {
      system.setVisionModifier(0);
    }, 3000);
  }

  sabotageOxygen(system: LifeSuppSystem): void {
    system.clearCompletedConsoles();

    const level = this.host.getLobby().getLevel();

    switch (level) {
      case Level.TheSkeld:
        system.setTimer(30);
        break;
      case Level.MiraHq:
        system.setTimer(45);
        break;
      default:
        throw new Error(`Attempted to sabotage oxygen on an unsupported map: ${level} (${Level[level]})`);
    }

    this.timer = setInterval(() => {
      system.decrementTimer();

      if (system.getTimer() <= 0) {
        this.host.endGame(GameOverReason.ImpostorsBySabotage);

        if (this.timer) {
          clearInterval(this.timer);
        }
      }
    }, 1000);
  }
}
