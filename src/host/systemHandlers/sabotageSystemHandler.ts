import { GameOverReason, Level } from "../../types/enums";
import { clamp } from "../../util/functions";
import { Bitfield } from "../../types";
import { Host } from "..";
import {
  HeliSabotageSystem,
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
    protected host: Host,
  ) {}

  sabotageHeliSystem(system: HeliSabotageSystem): void {
    system.setCountdown(90);
    system.clearCompletedConsoles();

    let i = 0;

    this.timer = setInterval(() => {
      system.decrementCountdown();
      system.decrementTimer();

      if (system.getCountdown() <= 0) {
        this.host.endGame(GameOverReason.ImpostorsBySabotage);
        this.clearTimer();

        return;
      }

      if (i % 10 === 0) {
        system.clearActiveConsoles();
        system.setTimer(10);
      }

      i++;
    }, 1000);
  }

  sabotageReactor(system: ReactorSystem | LaboratorySystem | HeliSabotageSystem): void {
    switch (this.host.getLobby().getLevel()) {
      case Level.TheSkeld:
      case Level.AprilSkeld:
        system.setCountdown(30);
        break;
      case Level.MiraHq:
        system.setCountdown(45);
        break;
      case Level.Polus:
        system.setCountdown(60);
        break;
      default:
        throw new Error("Attempted to sabotage reactor on a map without reactor.");
    }

    this.timer = setInterval(() => {
      system.decrementCountdown();

      if (system.getCountdown() <= 0) {
        this.host.endGame(GameOverReason.ImpostorsBySabotage);
        this.clearTimer();
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

    const startOfSabotage = Date.now();
    const sabotageCountdown = setInterval(() => {
      system.setVisionModifier(clamp(Math.floor(0xff - (((Date.now() - startOfSabotage) / 3000) * 0xff)), 0x00, 0xff));

      if (system.getVisionModifier() == 0x00) {
        clearInterval(sabotageCountdown);
      }
    }, 20);
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
        this.clearTimer();
      }
    }, 1000);
  }

  clearTimer(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      delete this.timer;
    }
  }
}
