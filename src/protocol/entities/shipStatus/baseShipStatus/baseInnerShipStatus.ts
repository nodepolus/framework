import { BaseRpcPacket, CloseDoorsOfTypePacket, RepairSystemPacket } from "../../../packets/rpc";
import { InnerNetObjectType, Level, RpcPacketType, SystemType } from "../../../../types/enums";
import { DataPacket, SpawnPacketObject } from "../../../packets/gameData";
import { MessageWriter } from "../../../../util/hazelMessage";
import { BaseEntityShipStatus, InternalSystemType } from ".";
import { BaseInnerNetObject } from "../../baseEntity";
import { Connection } from "../../../connection";
import { Lobby } from "../../../../lobby";
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
  RepairAmount,
  SabotageAmount,
  SecurityAmount,
} from "../../../packets/rpc/repairSystem/amounts";
import {
  AutoDoorsSystem,
  BaseSystem,
  DeconSystem,
  DeconTwoSystem,
  DoorsSystem,
  ElectricalDoorsSystem,
  HeliSabotageSystem,
  HqHudSystem,
  HudOverrideSystem,
  LaboratorySystem,
  LifeSuppSystem,
  MedScanSystem,
  MovingPlatformSystem,
  ReactorSystem,
  SabotageSystem,
  SecurityCameraSystem,
  SwitchSystem,
} from "../systems";

export abstract class BaseInnerShipStatus extends BaseInnerNetObject {
  protected readonly spawnSystemTypes: SystemType[];
  protected readonly level: Level;

  protected systems: BaseSystem[] = [];

  constructor(
    type: InnerNetObjectType,
    protected readonly parent: BaseEntityShipStatus,
    protected readonly systemTypes: SystemType[],
    spawnSystemTypes?: SystemType[],
    netId: number = parent.getLobby().getHostInstance().getNextNetId(),
  ) {
    super(type, parent, netId);

    this.spawnSystemTypes = spawnSystemTypes ?? this.systemTypes;

    switch (type) {
      case InnerNetObjectType.SkeldShipStatus:
        this.level = Level.TheSkeld;
        break;
      case InnerNetObjectType.MiraShipStatus:
        this.level = Level.MiraHq;
        break;
      case InnerNetObjectType.PolusShipStatus:
        this.level = Level.Polus;
        break;
      case InnerNetObjectType.AirshipStatus:
        this.level = Level.Airship;
        break;
      case InnerNetObjectType.DleksShipStatus:
        this.level = Level.AprilSkeld;
        break;
      default:
        throw new Error(`Unsupported ShipStatus type: ${type} (${InnerNetObjectType[type]})`);
    }

    this.initializeSystems();
  }

  abstract getParent(): BaseEntityShipStatus;

  abstract clone(): BaseInnerShipStatus;

  getLevel(): Level {
    return this.level;
  }

  getSystemTypes(): SystemType[] {
    return this.systemTypes;
  }

  getSpawnSystemTypes(): SystemType[] {
    return this.spawnSystemTypes;
  }

  getSystems(): BaseSystem[] {
    return this.systems;
  }

  async closeDoorsOfType(systemId: SystemType, _sendTo?: Connection[]): Promise<void> {
    const doorHandler = this.parent.getLobby().getHostInstance().getDoorHandler();

    if (doorHandler === undefined) {
      throw new Error("Received CloseDoorsOfType without a door handler");
    }

    await doorHandler.closeDoor(doorHandler.getDoorsForSystem(systemId));
    await doorHandler.setSystemTimeout(systemId, 30);
  }

  // TODO: Change amount to number and deserialize in the system itself?
  async repairSystem(systemId: SystemType, playerControlNetId: number, amount: RepairAmount, _sendTo?: Connection[]): Promise<void> {
    const lobby = this.parent.getLobby() as Lobby;
    const shipStatus = lobby.getSafeShipStatus();
    const systemsHandler = lobby.getHostInstance().getSystemsHandler();

    if (systemsHandler === undefined) {
      throw new Error("Received RepairSystem without a SystemsHandler instance");
    }

    const system = shipStatus.getShipStatus().getSystemFromType(systemId);
    const player = lobby.getPlayers().find(thePlayer => thePlayer.getEntity().getPlayerControl().getNetId() == playerControlNetId);
    const level = lobby.getLevel();

    if (player === undefined) {
      throw new Error(`Received RepairSystem from a non-player InnerNetObject: ${playerControlNetId}`);
    }

    switch (system.getType()) {
      case SystemType.Electrical:
        await systemsHandler.repairSwitch(player, system as SwitchSystem, amount as ElectricalAmount);
        break;
      case SystemType.Medbay:
        await systemsHandler.repairMedbay(player, system as MedScanSystem, amount as MedbayAmount);
        break;
      case SystemType.Oxygen:
        await systemsHandler.repairOxygen(player, system as LifeSuppSystem, amount as OxygenAmount);
        break;
      case SystemType.Reactor:
        if (level == Level.Airship) {
          await systemsHandler.repairHeliSystem(player, system as HeliSabotageSystem, amount as HeliSabotageAmount);
        } else {
          await systemsHandler.repairReactor(player, system as ReactorSystem, amount as ReactorAmount);
        }
        break;
      case SystemType.Laboratory:
        await systemsHandler.repairReactor(player, system as LaboratorySystem, amount as ReactorAmount);
        break;
      case SystemType.Security:
        await systemsHandler.repairSecurity(player, system as SecurityCameraSystem, amount as SecurityAmount);
        break;
      case SystemType.Doors:
        if (level == Level.Polus || level == Level.Airship) {
          await systemsHandler.repairPolusDoors(player, system as DoorsSystem, amount as PolusDoorsAmount);
        } else {
          throw new Error(`Received RepairSystem for Doors on an unimplemented level: ${level as Level} (${Level[level]})`);
        }
        break;
      case SystemType.Communications:
        if (level == Level.MiraHq) {
          await systemsHandler.repairHqHud(player, system as HqHudSystem, amount as MiraCommunicationsAmount);
        } else {
          await systemsHandler.repairHudOverride(player, system as HudOverrideSystem, amount as NormalCommunicationsAmount);
        }
        break;
      case SystemType.Decontamination:
        await systemsHandler.repairDecon(player, system as DeconSystem, amount as DecontaminationAmount);
        break;
      case SystemType.Decontamination2:
        await systemsHandler.repairDecon(player, system as DeconTwoSystem, amount as DecontaminationAmount);
        break;
      case SystemType.Sabotage:
        await systemsHandler.repairSabotage(player, system as SabotageSystem, amount as SabotageAmount);
        break;
      default:
        throw new Error(`Received RepairSystem packet for an unimplemented SystemType: ${system.getType()} (${SystemType[system.getType()]})`);
    }
  }

  handleRpc(connection: Connection, type: RpcPacketType, packet: BaseRpcPacket, _sendTo: Connection[]): void {
    switch (type) {
      case RpcPacketType.CloseDoorsOfType: {
        this.closeDoorsOfType((packet as CloseDoorsOfTypePacket).system);
        break;
      }
      case RpcPacketType.RepairSystem: {
        const data = packet as RepairSystemPacket;

        this.repairSystem(data.system, data.playerControlNetId, data.getAmount());
        break;
      }
      default:
        break;
    }
  }

  serializeData(old: BaseInnerShipStatus): DataPacket {
    const changedSystemTypes: SystemType[] = this.systems.map((currentSystem, systemIndex) => {
      const oldSystem = old.systems[systemIndex];

      if (currentSystem.getType() != oldSystem.getType()) {
        throw new Error(`Attempted comparison of two disparate SystemTypes: expected ${currentSystem.getType()} (${SystemType[currentSystem.getType()]}) but got ${oldSystem.getType()} (${SystemType[oldSystem.getType()]})`);
      }

      if (!currentSystem.equals(oldSystem)) {
        return currentSystem.getType();
      }

      return -1;
    }).filter(systemType => systemType > -1);

    return new DataPacket(
      this.netId,
      this.serializeSystems(old, changedSystemTypes),
    );
  }

  serializeSpawn(): SpawnPacketObject {
    return new SpawnPacketObject(
      this.netId,
      this.serializeSystems(undefined, this.spawnSystemTypes),
    );
  }

  getSystemFromType(systemType: SystemType): BaseSystem {
    switch (systemType) {
      case SystemType.Doors:
        if (this.level == Level.TheSkeld) {
          return this.systems[InternalSystemType.AutoDoors];
        }

        return this.systems[InternalSystemType.Doors];
      case SystemType.Communications:
        if (this.level == Level.MiraHq) {
          return this.systems[InternalSystemType.HqHud];
        }

        return this.systems[InternalSystemType.HudOverride];
      case SystemType.Decontamination:
        if (this.level == Level.Airship) {
          return this.systems[InternalSystemType.ElectricalDoors];
        }

        return this.systems[InternalSystemType.Decon];
      case SystemType.Decontamination2:
        if (this.level == Level.Airship) {
          return this.systems[InternalSystemType.AutoDoors];
        }

        return this.systems[InternalSystemType.Decon2];
      case SystemType.Electrical:
        return this.systems[InternalSystemType.Switch];
      case SystemType.Laboratory:
        return this.systems[InternalSystemType.Laboratory];
      case SystemType.Reactor:
        if (this.level == Level.Airship) {
          return this.systems[InternalSystemType.HeliSabotageSystem];
        }

        return this.systems[InternalSystemType.Reactor];
      case SystemType.Sabotage:
        return this.systems[InternalSystemType.Sabotage];
      case SystemType.Security:
        return this.systems[InternalSystemType.SecurityCamera];
      case SystemType.Medbay:
        return this.systems[InternalSystemType.MedScan];
      case SystemType.Oxygen:
        return this.systems[InternalSystemType.Oxygen];
      case SystemType.GapRoom:
        return this.systems[InternalSystemType.MovingPlatform];
      default:
        throw new Error(`Tried to get unimplemented SystemType: ${systemType} (${SystemType[systemType]})`);
    }
  }

  protected initializeSystems(): this {
    for (let i = 0; i < this.systemTypes.length; i++) {
      const type = this.systemTypes[i];

      switch (type) {
        case SystemType.Doors:
          if (this.level == Level.TheSkeld) {
            this.systems[InternalSystemType.AutoDoors] = new AutoDoorsSystem(this);
          } else {
            this.systems[InternalSystemType.Doors] = new DoorsSystem(this);
          }
          break;
        case SystemType.Communications:
          if (this.level == Level.MiraHq) {
            this.systems[InternalSystemType.HqHud] = new HqHudSystem(this);
          } else {
            this.systems[InternalSystemType.HudOverride] = new HudOverrideSystem(this);
          }
          break;
        case SystemType.Decontamination:
          if (this.level == Level.Airship) {
            this.systems[InternalSystemType.ElectricalDoors] = new ElectricalDoorsSystem(this);
          } else {
            this.systems[InternalSystemType.Decon] = new DeconSystem(this);
          }
          break;
        case SystemType.Decontamination2:
          if (this.level == Level.Airship) {
            this.systems[InternalSystemType.AutoDoors] = new AutoDoorsSystem(this);
          } else {
            this.systems[InternalSystemType.Decon2] = new DeconTwoSystem(this);
          }
          break;
        case SystemType.Electrical:
          this.systems[InternalSystemType.Switch] = new SwitchSystem(this);
          break;
        case SystemType.Laboratory:
          this.systems[InternalSystemType.Laboratory] = new LaboratorySystem(this);
          break;
        case SystemType.Reactor:
          if (this.level == Level.Airship) {
            this.systems[InternalSystemType.HeliSabotageSystem] = new HeliSabotageSystem(this);
          } else {
            this.systems[InternalSystemType.Reactor] = new ReactorSystem(this);
          }
          break;
        case SystemType.Sabotage:
          this.systems[InternalSystemType.Sabotage] = new SabotageSystem(this);
          break;
        case SystemType.Security:
          this.systems[InternalSystemType.SecurityCamera] = new SecurityCameraSystem(this);
          break;
        case SystemType.Medbay:
          this.systems[InternalSystemType.MedScan] = new MedScanSystem(this);
          break;
        case SystemType.Oxygen:
          this.systems[InternalSystemType.Oxygen] = new LifeSuppSystem(this);
          break;
        case SystemType.GapRoom:
          this.systems[InternalSystemType.MovingPlatform] = new MovingPlatformSystem(this);
          break;
        default:
          throw new Error(`Tried to get unimplemented SystemType: ${type} (${SystemType[type]})`);
      }
    }

    return this;
  }

  protected serializeSystems(old: BaseInnerShipStatus | undefined, systems: SystemType[]): MessageWriter {
    const writer: MessageWriter = new MessageWriter();

    for (let i = 0; i < systems.length; i++) {
      const system = this.getSystemFromType(systems[i]);

      writer.startMessage(systems[i])
        .writeBytes(old === undefined ? system.serializeSpawn() : system.serializeData(old.getSystemFromType(systems[i])))
        .endMessage();
    }

    return writer;
  }
}
