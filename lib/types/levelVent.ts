import { Level, SystemType } from "./enums";
import { Vector2 } from "./vector2";

export class LevelVent {
  constructor(
    private readonly level: Level,
    private readonly id: number,
    private readonly name: string,
    private readonly system: SystemType,
    private readonly position: Vector2,
    private readonly connectedVents: readonly number[],
  ) {}

  getLevel(): Level {
    return this.level;
  }

  getId(): number {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  getSystem(): SystemType {
    return this.system;
  }

  getPosition(): Vector2 {
    return this.position;
  }

  getConnectedVents(): readonly number[] {
    return this.connectedVents;
  }

  isConnectedTo(other?: LevelVent): boolean {
    if (other === undefined) {
      return false;
    }

    if (this.level !== other.level) {
      return false;
    }

    return this.canMoveTo(other) || this.canMoveFrom(other);
  }

  canMoveTo(other?: LevelVent): boolean {
    if (other === undefined) {
      return false;
    }

    return this.connectedVents.includes(other.getId());
  }

  canMoveFrom(other?: LevelVent): boolean {
    if (other === undefined) {
      return false;
    }

    return other.canMoveTo(this);
  }
}
