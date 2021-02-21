import { InnerNetObjectType, Level, SystemType } from "../../../types/enums";
import { BaseInnerNetEntity, BaseInnerNetObject } from "../baseEntity";
import { DataPacket, SpawnPacketObject } from "../../packets/gameData";
import { RepairAmount } from "../../packets/rpc/repairSystem/amounts";
import { MessageWriter } from "../../../util/hazelMessage";
import { InternalSystemType } from ".";
import {
  AirshipReactorSystem,
  AutoDoorsSystem,
  BaseSystem,
  DeconSystem,
  DeconTwoSystem,
  DoorsSystem,
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
} from "./systems";

export abstract class BaseInnerShipStatus extends BaseInnerNetObject {
  public readonly spawnSystemTypes: SystemType[];

  public systems: BaseSystem[] = [];

  private readonly level: Level;

  protected constructor(
    type: InnerNetObjectType,
    netId: number,
    parent: BaseInnerNetEntity,
    public readonly systemTypes: SystemType[],
    spawnSystemTypes?: SystemType[],
  ) {
    super(type, netId, parent);

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
      case InnerNetObjectType.SkeldAprilShipStatus:
        this.level = Level.AprilSkeld;
        break;
      default:
        throw new Error(`Unsupported ShipStatus type: ${type} (${InnerNetObjectType[type]})`);
    }

    this.initializeSystems();
  }

  abstract clone(): BaseInnerShipStatus;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  closeDoorsOfType(_systemId: SystemType): void {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  repairSystem(_systemId: SystemType, _playerControlNetId: number, _amount: RepairAmount): void {}

  serializeData(old: BaseInnerShipStatus): DataPacket {
    const changedSystemTypes: SystemType[] = this.systems.map((currentSystem, systemIndex) => {
      const oldSystem = old.systems[systemIndex];

      if (currentSystem.type != oldSystem.type) {
        throw new Error(`Attempted comparison of two disparate SystemTypes: expected ${currentSystem.type} (${SystemType[currentSystem.type]}) but got ${oldSystem.type} (${SystemType[oldSystem.type]})`);
      }

      const isEqual = currentSystem.equals(oldSystem);

      if (!isEqual) {
        return currentSystem.type;
      }

      return -1;
    }).filter(systemType => systemType > -1);

    const writer = new MessageWriter()
      .writePackedUInt32(this.serializeSystemsToDirtyBits(changedSystemTypes))
      .writeBytes(this.getSystems(old, changedSystemTypes));

    return new DataPacket(
      this.netId,
      writer,
    );
  }

  serializeSpawn(): SpawnPacketObject {
    return new SpawnPacketObject(
      this.netId,
      this.getSystems(undefined, this.spawnSystemTypes),
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
        return this.systems[InternalSystemType.Decon];
      case SystemType.Decontamination2:
        return this.systems[InternalSystemType.Decon2];
      case SystemType.Electrical:
        return this.systems[InternalSystemType.Switch];
      case SystemType.Laboratory:
        return this.systems[InternalSystemType.Laboratory];
      case SystemType.Reactor:
        if (this.level == Level.Airship) {
          return this.systems[InternalSystemType.AirshipReactor];
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
      case SystemType.Weapons:
        return this.systems[InternalSystemType.MovingPlatform];
      default:
        throw new Error(`Tried to get unimplemented SystemType: ${systemType} (${SystemType[systemType]})`);
    }
  }

  private initializeSystems(): void {
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
          this.systems[InternalSystemType.Decon] = new DeconSystem(this);
          break;
        case SystemType.Decontamination2:
          this.systems[InternalSystemType.Decon2] = new DeconTwoSystem(this);
          break;
        case SystemType.Electrical:
          this.systems[InternalSystemType.Switch] = new SwitchSystem(this);
          break;
        case SystemType.Laboratory:
          this.systems[InternalSystemType.Laboratory] = new LaboratorySystem(this);
          break;
        case SystemType.Reactor:
          if (this.level == Level.Airship) {
            this.systems[InternalSystemType.AirshipReactor] = new AirshipReactorSystem(this);
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
        case SystemType.Weapons:
          this.systems[InternalSystemType.MovingPlatform] = new MovingPlatformSystem(this);
          break;
        default:
          throw new Error(`Tried to get unimplemented SystemType: ${type} (${SystemType[type]})`);
      }
    }
  }

  private serializeSystemsToDirtyBits(otherSystems: SystemType[]): number {
    let n = 0;

    for (let i = 0; i < this.systemTypes.length; i++) {
      if (otherSystems.indexOf(this.systemTypes[i]) > -1) {
        n |= 1 << this.systemTypes[i];
      }
    }

    return n;
  }

  private getSystems(old: BaseInnerShipStatus | undefined, systems: SystemType[]): MessageWriter {
    const writers: MessageWriter[] = new Array(systems.length);

    for (let i = 0; i < systems.length; i++) {
      const system = this.getSystemFromType(systems[i]);

      if (old) {
        writers[i] = system.data(old.getSystemFromType(systems[i]));
      } else {
        writers[i] = system.getSpawn();
      }
    }

    return MessageWriter.concat(...writers);
  }
}
