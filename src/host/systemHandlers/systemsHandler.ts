import { BaseInnerShipStatus } from "../../protocol/entities/shipStatus/baseShipStatus";
import { DecontaminationDoorState, Level, SystemType } from "../../types/enums";
import { GameDataPacket } from "../../protocol/packets/root";
import { clamp, notUndefined } from "../../util/functions";
import { Player } from "../../player";
import { Host } from "..";
import {
  HeliSabotageAction,
  MedbayAction,
  MiraCommunicationsAction,
  OxygenAction,
  ReactorAction,
} from "../../protocol/packets/rpc/repairSystem/actions";
import {
  DecontaminationAmount,
  ElectricalAmount,
  HeliSabotageAmount,
  MedbayAmount,
  MiraCommunicationsAmount,
  NormalCommunicationsAmount,
  OxygenAmount,
  PolusDoorsAmount,
  ReactorAmount,
  SabotageAmount,
  SecurityAmount,
} from "../../protocol/packets/rpc/repairSystem/amounts";
import {
  DeconSystem,
  DeconTwoSystem,
  DoorsSystem,
  HeliSabotageSystem,
  HqHudSystem,
  HudOverrideSystem,
  LaboratorySystem,
  LifeSuppSystem,
  MedScanSystem,
  ReactorSystem,
  SabotageSystem,
  SecurityCameraSystem,
  SwitchSystem,
} from "../../protocol/entities/shipStatus/systems";
import {
  GameScannerQueuedEvent,
  GameScannerStartedEvent,
  GameScannerDequeuedEvent,
  GameScannerStoppedEvent,
  GameCamerasOpenedEvent,
  GameCamerasClosedEvent,
} from "../../api/events/game";

export class SystemsHandler {
  protected oldShipStatus: BaseInnerShipStatus;
  protected sabotageCountdownInterval?: NodeJS.Timeout;

  constructor(
    protected readonly host: Host,
  ) {
    this.oldShipStatus = this.host.getLobby().getSafeShipStatus().getShipStatus();
  }

  async repairHeliSystem<T extends HeliSabotageSystem>(repairer: Player, system: T, amount: HeliSabotageAmount): Promise<void> {
    const sabotageHandler = this.host.getSabotageHandler();

    if (sabotageHandler === undefined) {
      throw new Error("Attempted to repair reactor without a SabotageHandler instance");
    }

    this.setOldShipStatus();

    switch (amount.getAction()) {
      case HeliSabotageAction.OpenedConsole:
        system.setActiveConsole(repairer.getId(), amount.getConsoleId());
        break;
      case HeliSabotageAction.ClosedConsole:
        system.removeActiveConsole(repairer.getId());
        break;
      case HeliSabotageAction.EnteredCode:
        system.setTimer(10);
        system.addCompletedConsole(amount.getConsoleId());

        if (system.getCompletedConsoles().size == 2) {
          system.setCountdown(10000);
          sabotageHandler.clearTimer();
        }
        break;
    }

    await this.sendDataUpdate();
  }

  async repairDecon<T extends DeconSystem | DeconTwoSystem>(_repairer: Player, system: T, amount: DecontaminationAmount): Promise<void> {
    let state = 0;

    if (amount.isEntering()) {
      state |= DecontaminationDoorState.Enter;
    } else {
      state |= DecontaminationDoorState.Exit;
    }

    if (amount.isHeadingUp()) {
      state |= DecontaminationDoorState.HeadingUp;
    }

    await this.host.getDecontaminationHandlers()[system instanceof DeconSystem ? 0 : 1].start(state);
  }

  async repairPolusDoors<T extends DoorsSystem>(_repairer: Player, system: T, amount: PolusDoorsAmount): Promise<void> {
    this.setOldShipStatus();
    system.setDoorState(amount.getDoorId(), true);
    await this.sendDataUpdate();
  }

  async repairHqHud<T extends HqHudSystem>(repairer: Player, system: T, amount: MiraCommunicationsAmount): Promise<void> {
    const sabotageHandler = this.host.getSabotageHandler();

    if (sabotageHandler === undefined) {
      throw new Error("Attempted to repair reactor without a SabotageHandler instance");
    }

    this.setOldShipStatus();

    switch (amount.getAction()) {
      case MiraCommunicationsAction.OpenedConsole:
        system.setActiveConsole(repairer.getId(), amount.getConsoleId());
        break;
      case MiraCommunicationsAction.ClosedConsole:
        system.removeActiveConsole(repairer.getId());
        break;
      case MiraCommunicationsAction.EnteredCode:
        system.addCompletedConsole(amount.getConsoleId());

        if (system.getCompletedConsoles().size == 2) {
          sabotageHandler.clearTimer();
        }
        break;
    }

    await this.sendDataUpdate();
  }

  async repairHudOverride<T extends HudOverrideSystem>(_repairer: Player, system: T, amount: NormalCommunicationsAmount): Promise<void> {
    this.setOldShipStatus();
    system.setSabotaged(!amount.isRepaired());
    await this.sendDataUpdate();
  }

  async repairOxygen<T extends LifeSuppSystem>(_repairer: Player, system: T, amount: OxygenAmount): Promise<void> {
    const sabotageHandler = this.host.getSabotageHandler();

    if (sabotageHandler === undefined) {
      throw new Error("Attempted to repair oxygen without a SabotageHandler instance");
    }

    this.setOldShipStatus();

    switch (amount.getAction()) {
      case OxygenAction.Completed:
        system.addCompletedConsole(amount.getConsoleId());

        if (system.getCompletedConsoles().size == 2) {
          system.setTimer(10000);
          sabotageHandler.clearTimer();
        }
        break;
      case OxygenAction.Repaired:
        system.setTimer(10000);
        sabotageHandler.clearTimer();
        break;
    }

    await this.sendDataUpdate();
  }

  async repairMedbay<T extends MedScanSystem>(_repairer: Player, system: T, amount: MedbayAmount): Promise<void> {
    this.setOldShipStatus();

    const game = this.host.getLobby().getSafeGame();
    const player = this.host.getLobby().findPlayerByPlayerId(amount.getPlayerId())!;

    if (amount.getAction() == MedbayAction.EnteredQueue) {
      if (system.getPlayersInQueue().size > 0) {
        await this.host.getLobby().getServer().emit("game.scanner.queued", new GameScannerQueuedEvent(
          game,
          player,
          new Set([...system.getPlayersInQueue()]
            .map(id => this.host.getLobby().findPlayerByPlayerId(id))
            .filter(notUndefined),
          ),
        ));
      } else {
        await this.host.getLobby().getServer().emit("game.scanner.started", new GameScannerStartedEvent(game, player));
      }

      system.addPlayerInQueue(player.getId());
    } else {
      system.removePlayerInQueue(amount.getPlayerId());

      if (system.getPlayersInQueue().size > 0) {
        await this.host.getLobby().getServer().emit("game.scanner.dequeued", new GameScannerDequeuedEvent(
          game,
          player,
          new Set([...system.getPlayersInQueue()]
            .map(id => this.host.getLobby().findPlayerByPlayerId(id))
            .filter(notUndefined),
          ),
        ));
      } else {
        await this.host.getLobby().getServer().emit("game.scanner.stopped", new GameScannerStoppedEvent(game, player));
      }
    }

    await this.sendDataUpdate();
  }

  async repairReactor<T extends ReactorSystem | LaboratorySystem>(repairer: Player, system: T, amount: ReactorAmount): Promise<void> {
    const sabotageHandler = this.host.getSabotageHandler();

    if (sabotageHandler === undefined) {
      throw new Error("Attempted to repair reactor without a SabotageHandler instance");
    }

    this.setOldShipStatus();

    switch (amount.getAction()) {
      case ReactorAction.PlacedHand:
        system.setUserConsole(repairer.getId(), amount.getConsoleId());

        if (new Set(system.getUserConsoles().values()).size == 2) {
          system.setCountdown(10000);
          sabotageHandler.clearTimer();
        }
        break;
      case ReactorAction.RemovedHand:
        system.removeUserConsole(repairer.getId());
        break;
      case ReactorAction.Repaired:
        system.setCountdown(10000);
        sabotageHandler.clearTimer();
        break;
    }

    await this.sendDataUpdate();
  }

  isSabotaged(checkNonCritical: boolean = false): boolean {
    const level = this.host.getLobby().getLevel();
    const ship = this.getShipStatus();

    switch (level) {
      case Level.TheSkeld:
      case Level.AprilSkeld:
      case Level.MiraHq:
        if ((ship.getSystemFromType(SystemType.Reactor) as ReactorSystem).isSabotaged() ||
            (ship.getSystemFromType(SystemType.Oxygen) as LifeSuppSystem).isSabotaged()
        ) {
          return true;
        }

        if (checkNonCritical) {
          if ((ship.getSystemFromType(SystemType.Electrical) as SwitchSystem).isSabotaged()) {
            return true;
          }

          if (level === Level.MiraHq) {
            if ((ship.getSystemFromType(SystemType.Communications) as HqHudSystem).isSabotaged()) {
              return true;
            }
          } else if ((ship.getSystemFromType(SystemType.Communications) as HudOverrideSystem).isSabotaged()) {
            return true;
          }
        }

        return false;
      case Level.Polus:
        if ((ship.getSystemFromType(SystemType.Laboratory) as LaboratorySystem).isSabotaged()) {
          return true;
        }

        if (checkNonCritical) {
          if ((ship.getSystemFromType(SystemType.Electrical) as SwitchSystem).isSabotaged() ||
              (ship.getSystemFromType(SystemType.Communications) as HudOverrideSystem).isSabotaged()
          ) {
            return true;
          }
        }

        return false;
      case Level.Airship:
        if ((ship.getSystemFromType(SystemType.Reactor) as HeliSabotageSystem).isSabotaged()) {
          return true;
        }

        if (checkNonCritical) {
          if ((ship.getSystemFromType(SystemType.Electrical) as SwitchSystem).isSabotaged() ||
              (ship.getSystemFromType(SystemType.Communications) as HudOverrideSystem).isSabotaged()
          ) {
            return true;
          }
        }

        return false;
    }
  }

  async repairAll(repairNonCritical: boolean = false): Promise<void> {
    const sabotageHandler = this.host.getSabotageHandler();

    if (sabotageHandler === undefined) {
      throw new Error("Attempted to repair reactor without a SabotageHandler instance");
    }

    const level = this.host.getLobby().getLevel();
    const ship = this.getShipStatus();

    this.setOldShipStatus();
    sabotageHandler.clearTimer();

    switch (level) {
      case Level.TheSkeld:
      case Level.AprilSkeld:
      case Level.MiraHq:
        (ship.getSystemFromType(SystemType.Reactor) as ReactorSystem).repair();
        (ship.getSystemFromType(SystemType.Oxygen) as LifeSuppSystem).repair();

        if (repairNonCritical) {
          (ship.getSystemFromType(SystemType.Electrical) as SwitchSystem).repair();

          if (level === Level.MiraHq) {
            (ship.getSystemFromType(SystemType.Communications) as HqHudSystem).repair();
          } else {
            (ship.getSystemFromType(SystemType.Communications) as HudOverrideSystem).repair();
          }
        }
        break;
      case Level.Polus:
        (ship.getSystemFromType(SystemType.Laboratory) as LaboratorySystem).repair();

        if (repairNonCritical) {
          (ship.getSystemFromType(SystemType.Electrical) as SwitchSystem).repair();
          (ship.getSystemFromType(SystemType.Communications) as HudOverrideSystem).repair();
        }
        break;
      case Level.Airship:
        (ship.getSystemFromType(SystemType.Reactor) as HeliSabotageSystem).repair();

        if (repairNonCritical) {
          (ship.getSystemFromType(SystemType.Electrical) as SwitchSystem).repair();
          (ship.getSystemFromType(SystemType.Communications) as HudOverrideSystem).repair();
        }
        break;
    }

    await this.sendDataUpdate();
  }

  async repairSabotage<T extends SabotageSystem>(_repairer: Player, system: T, amount: SabotageAmount): Promise<void> {
    const sabotageHandler = this.host.getSabotageHandler();

    if (sabotageHandler === undefined) {
      throw new Error("Attempted to sabotage without a SabotageHandler instance");
    }

    this.setOldShipStatus();

    const ship = this.getShipStatus();
    const type = amount.getSystemType();

    system.setCooldown(30);

    this.sabotageCountdownInterval = setInterval(() => {
      system.decrementCooldown();

      if (system.getCooldown() == 0) {
        this.clearSabotageTimer();
      }
    }, 1000);

    switch (type) {
      case SystemType.Reactor:
      case SystemType.Laboratory:
        if (this.host.getLobby().getLevel() == Level.Airship) {
          sabotageHandler.sabotageHeliSystem(ship.getSystemFromType(type) as HeliSabotageSystem);
        } else {
          sabotageHandler.sabotageReactor(ship.getSystemFromType(type) as ReactorSystem | LaboratorySystem | HeliSabotageSystem);
        }
        break;
      case SystemType.Oxygen:
        sabotageHandler.sabotageOxygen(ship.getSystemFromType(type) as LifeSuppSystem);
        break;
      case SystemType.Communications:
        sabotageHandler.sabotageCommunications(ship.getSystemFromType(type) as HudOverrideSystem | HqHudSystem);
        break;
      case SystemType.Electrical:
        sabotageHandler.sabotageElectrical(ship.getSystemFromType(type) as SwitchSystem);
        break;
      default:
        throw new Error(`Attempted to sabotage an unsupported SystemType: ${type} (${SystemType[type]})`);
    }

    await this.sendDataUpdate();
  }

  async repairSecurity<T extends SecurityCameraSystem>(repairer: Player, system: T, amount: SecurityAmount): Promise<void> {
    this.setOldShipStatus();

    if (amount.isViewingCameras()) {
      await this.host.getLobby().getServer().emit("game.cameras.opened", new GameCamerasOpenedEvent(this.host.getLobby().getSafeGame(), repairer));

      system.addPlayerViewingCameras(repairer.getId());
    } else {
      await this.host.getLobby().getServer().emit("game.cameras.closed", new GameCamerasClosedEvent(this.host.getLobby().getSafeGame(), repairer));

      system.removePlayerViewingCameras(repairer.getId());
    }

    await this.sendDataUpdate();
  }

  async repairSwitch<T extends SwitchSystem>(_repairer: Player, system: T, amount: ElectricalAmount): Promise<void> {
    this.setOldShipStatus();
    system.getActualSwitches().toggle(amount.getSwitchIndex());

    if (system.getActualSwitches().equals(system.getExpectedSwitches())) {
      const startOfRepair = Date.now();
      const repairCountdown = setInterval(() => {
        if (!system.getActualSwitches().equals(system.getExpectedSwitches()) || this.host.getLobby().getShipStatus() === undefined) {
          clearInterval(repairCountdown);

          return;
        }

        this.setOldShipStatus();
        system.setVisionModifier(clamp(Math.ceil(((Date.now() - startOfRepair) / 3000) * 0xff), 0x00, 0xff));
        this.sendDataUpdate();

        if (system.getVisionModifier() == 0xff) {
          clearInterval(repairCountdown);
        }
      }, 20);
    }

    await this.sendDataUpdate();
  }

  setOldShipStatus(): this {
    this.oldShipStatus = this.getShipStatus().clone();

    return this;
  }

  async sendDataUpdate(): Promise<void> {
    await this.host.getLobby().sendRootGamePacket(new GameDataPacket([
      this.getShipStatus().serializeData(this.oldShipStatus),
    ], this.host.getLobby().getCode()));
  }

  clearSabotageTimer(): void {
    if (this.sabotageCountdownInterval !== undefined) {
      clearInterval(this.sabotageCountdownInterval);
      delete this.sabotageCountdownInterval;
    }
  }

  protected getShipStatus(): BaseInnerShipStatus {
    return this.host.getLobby().getSafeShipStatus().getShipStatus();
  }
}
