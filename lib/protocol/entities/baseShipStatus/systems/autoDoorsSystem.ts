import { MessageReader, MessageWriter } from "../../../../util/hazelMessage";
import { SKELD_DOOR_COUNT } from "../../../../util/constants";
import { SystemType } from "../../../../types/systemType";
import { BaseSystem } from "./baseSystem";

export class AutoDoorsSystem extends BaseSystem<AutoDoorsSystem> {
  public doors: boolean[] = Array(SKELD_DOOR_COUNT).fill(true);

  constructor() {
    super(SystemType.Doors);
  }

  static spawn(data: MessageReader): AutoDoorsSystem {
    const autoDoorsSystem = new AutoDoorsSystem();

    autoDoorsSystem.setSpawn(data);

    return autoDoorsSystem;
  }

  getData(old: AutoDoorsSystem): MessageWriter {
    const writer = new MessageWriter();
    let mask = 0;
    const dirtyDoors: number[] = [];

    for (let i = 0; i < this.doors.length; i++) {
      if (old.doors[i] != this.doors[i]) {
        mask |= 1 << i;

        dirtyDoors.push(this.doors[i] ? 1 : 0);
      }
    }

    return writer.writePackedUInt32(mask).writeBytes(dirtyDoors);
  }

  setData(data: MessageReader): void {
    const mask = data.readPackedUInt32();

    for (let i = 0; i < this.doors.length; i++) {
      if ((mask & (1 << i)) != 0) {
        this.doors[i] = data.readBoolean();
      }
    }
  }

  getSpawn(): MessageWriter {
    const writer = new MessageWriter();

    for (let i = 0; i < this.doors.length; i++) {
      writer.writeBoolean(this.doors[i]);
    }

    return writer;
  }

  setSpawn(data: MessageReader): void {
    for (let i = 0; i < this.doors.length; i++) {
      this.doors[i] = data.readBoolean();
    }
  }

  equals(old: AutoDoorsSystem): boolean {
    if (this.doors.length != old.doors.length) {
      return false;
    }

    for (let i = 0; i < this.doors.length; i++) {
      if (this.doors[i] != old.doors[i]) {
        return false;
      }
    }

    return true;
  }
}