import { MessageReader, MessageWriter } from "../../../util/hazelMessage";
import { RepairAmount } from "../../packets/rpc/repairSystem/amounts";
import { SpawnInnerNetObject } from "../../packets/gameData/types";
import { Level, SystemType } from "../../../types/enums";
import { InnerNetObjectType } from "../types/enums";
import { DataPacket } from "../../packets/gameData";
import { BaseGameObject, Entity } from "../types";
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

type System = AirshipReactorSystem
| AutoDoorsSystem
| DeconSystem
| DeconTwoSystem
| DoorsSystem
| HqHudSystem
| HudOverrideSystem
| LaboratorySystem
| LifeSuppSystem
| MedScanSystem
| MovingPlatformSystem
| ReactorSystem
| SabotageSystem
| SecurityCameraSystem
| SwitchSystem;

export abstract class BaseShipStatus<T, U extends Entity> extends BaseGameObject<T> {
  public systems: BaseSystem<System>[] = [];
  public spawnSystemTypes: SystemType[];

  private readonly level: Level;

  protected constructor(public type: InnerNetObjectType, netId: number, parent: U, public systemTypes: SystemType[], spawnSystemTypes?: SystemType[]) {
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

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  closeDoorsOfType(_systemId: SystemType): void {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  repairSystem(_systemId: SystemType, _playerControlNetId: number, _amount: RepairAmount): void {}

  getData(old: BaseShipStatus<T, U>): DataPacket {
    const changedSystemTypes: SystemType[] = this.systems.map((currentSystem, systemIndex) => {
      const oldSystem = old.systems[systemIndex];

      if (currentSystem.type != oldSystem.type) {
        throw new Error(`Attempted comparison of two disperate SystemTypes: expected ${currentSystem.type} (${SystemType[currentSystem.type]}) but got ${oldSystem.type} (${SystemType[oldSystem.type]})`);
      }

      // console.log({ oldSystem, currentSystem });

      const isEqual = currentSystem.equals(oldSystem);

      // console.log(currentSystem.type, isEqual);

      if (!isEqual) {
        return currentSystem.type;
      }

      return -1;
    }).filter(systemType => systemType != -1);

    const writer = new MessageWriter()
      .writePackedUInt32(this.serializeSystemsToDirtyBits(changedSystemTypes))
      .writeBytes(this.getSystems(old, changedSystemTypes, false));

    return new DataPacket(
      this.id,
      writer,
    );
  }

  setData(data: MessageReader | MessageWriter): void {
    const reader = MessageReader.fromRawBytes(data.buffer);

    this.setSystems(
      this.deserializeDirtyBitsToSystems(reader.readPackedUInt32()),
      reader.readRemainingBytes(),
      false,
    );
  }

  getSpawn(): SpawnInnerNetObject {
    return new SpawnInnerNetObject(
      this.id,
      this.getSystems(undefined, this.spawnSystemTypes, true),
    );
  }

  setSpawn(data: MessageReader | MessageWriter): void {
    this.setSystems(this.spawnSystemTypes, MessageReader.fromMessage(data), true);
  }

  getSystemFromType(systemType: SystemType): BaseSystem<System> {
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
            this.systems[InternalSystemType.AutoDoors] = new AutoDoorsSystem();
          } else {
            this.systems[InternalSystemType.Doors] = new DoorsSystem();
          }
          break;
        case SystemType.Communications:
          if (this.level == Level.MiraHq) {
            this.systems[InternalSystemType.HqHud] = new HqHudSystem();
          } else {
            this.systems[InternalSystemType.HudOverride] = new HudOverrideSystem();
          }
          break;
        case SystemType.Decontamination:
          this.systems[InternalSystemType.Decon] = new DeconSystem();
          break;
        case SystemType.Decontamination2:
          this.systems[InternalSystemType.Decon2] = new DeconTwoSystem();
          break;
        case SystemType.Electrical:
          this.systems[InternalSystemType.Switch] = new SwitchSystem();
          break;
        case SystemType.Laboratory:
          this.systems[InternalSystemType.Laboratory] = new LaboratorySystem();
          break;
        case SystemType.Reactor:
          if (this.level == Level.Airship) {
            this.systems[InternalSystemType.AirshipReactor] = new AirshipReactorSystem();
          } else {
            this.systems[InternalSystemType.Reactor] = new ReactorSystem();
          }
          break;
        case SystemType.Sabotage:
          this.systems[InternalSystemType.Sabotage] = new SabotageSystem();
          break;
        case SystemType.Security:
          this.systems[InternalSystemType.SecurityCamera] = new SecurityCameraSystem();
          break;
        case SystemType.Medbay:
          this.systems[InternalSystemType.MedScan] = new MedScanSystem();
          break;
        case SystemType.Oxygen:
          this.systems[InternalSystemType.Oxygen] = new LifeSuppSystem();
          break;
        case SystemType.Weapons:
          this.systems[InternalSystemType.MovingPlatform] = new MovingPlatformSystem();
          break;
        default:
          throw new Error(`Tried to get unimplemented SystemType: ${type} (${SystemType[type]})`);
      }
    }
  }

  private serializeSystemsToDirtyBits(otherSystems: SystemType[]): number {
    let n = 0;

    for (let i = 0; i < this.systemTypes.length; i++) {
      if (otherSystems.indexOf(this.systemTypes[i]) != -1) {
        n |= 1 << this.systemTypes[i];
      }
    }

    return n;
  }

  private deserializeDirtyBitsToSystems(dirtyBits: number): SystemType[] {
    const systemTypes: SystemType[] = [];

    for (let i = 0; i < Object.keys(SystemType).length / 2; i++) {
      if ((dirtyBits & (1 << i)) != 0) {
        systemTypes.push(i);
      }
    }

    return systemTypes;
  }

  private setSystems(systems: SystemType[], data: MessageReader, fromSpawn: boolean): void {
    for (let i = 0; i < systems.length; i++) {
      const system = this.getSystemFromType(systems[i]);

      system[fromSpawn ? "spawn" : "data"](data);

      // console.log("Deserialized", system, "current reader", data);
    }
  }

  private getSystems(old: undefined, systems: SystemType[], fromSpawn: true): MessageWriter;
  private getSystems(old: BaseShipStatus<T, U>, systems: SystemType[], fromSpawn: false): MessageWriter;
  private getSystems(old: BaseShipStatus<T, U> | undefined, systems: SystemType[], fromSpawn: boolean): MessageWriter {
    const writers: MessageWriter[] = new Array(systems.length);

    for (let i = 0; i < systems.length; i++) {
      const system = this.getSystemFromType(systems[i]);

      // console.log("Current status at cursor", this);

      if (fromSpawn) {
        writers[i] = system.spawn();
      } else {
        writers[i] = system.data(old!.getSystemFromType(systems[i]));
      }
    }

    return MessageWriter.concat(...writers);
  }
}