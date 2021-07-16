import { Level } from "../types/enums";
import { Vector2 } from "../types";

type LevelSpawnPositions = Readonly<{
  initial: Vector2;
  meetingOne: Vector2;
  meetingTwo: Vector2;
}>;

const SPAWN_RADIUS_THE_SKELD = 1.6 as const;

const SPAWN_RADIUS_MIRA_HQ = 1.55 as const;

const SPAWN_RADIUS_POLUS = 1 as const;

// TODO
const SPAWN_RADIUS_AIRSHIP = 1 as const;

const SPAWN_POSITIONS_DROPSHIP: readonly Vector2[] = [
  new Vector2(-1.6, 2.4),
  new Vector2(-1.3, 2.5),
  new Vector2(-1.1, 2.5),
  new Vector2(-0.8, 2.6),
  new Vector2(-0.6, 2.7),
  new Vector2(0.7, 2.8),
  new Vector2(0.9, 2.6),
  new Vector2(1.1, 2.6),
  new Vector2(1.4, 2.5),
  new Vector2(1.7, 2.4),
];

const SPAWN_POSITIONS_SKELD: LevelSpawnPositions = {
  initial: new Vector2(-0.72, 0.62),
  meetingOne: new Vector2(-0.72, 0.62),
  meetingTwo: new Vector2(-0.72, 0.62),
};

const SPAWN_POSITIONS_MIRA_HQ: LevelSpawnPositions = {
  initial: new Vector2(-4.4, 2.2),
  meetingOne: new Vector2(24.043, 1.72),
  meetingTwo: new Vector2(0.0, 0.0),
};

const SPAWN_POSITIONS_POLUS: LevelSpawnPositions = {
  initial: new Vector2(16.64, -2.46),
  meetingOne: new Vector2(17.726, -16.286),
  meetingTwo: new Vector2(17.726, -17.515),
};

const SPAWN_POSITIONS_AIRSHIP: LevelSpawnPositions = {
  // TODO
  initial: new Vector2(0, 0),
  meetingOne: new Vector2(0, 0),
  meetingTwo: new Vector2(0, 0),
};

const PLAYER_TRUE_POSITION_OFFSET: Vector2 = new Vector2(0, 0.3636);

/**
 * A helper class for retrieving static data for spawn positions.
 */
export class SpawnPositions {
  /**
   * Gets the spawn radius for Airship.
   */
  static radiusForLevel(level: Level): number {
    switch (level) {
      case Level.TheSkeld:
      case Level.AprilSkeld:
        return SPAWN_RADIUS_THE_SKELD;
      case Level.MiraHq:
        return SPAWN_RADIUS_MIRA_HQ;
      case Level.Polus:
        return SPAWN_RADIUS_POLUS;
      case Level.Airship:
        return SPAWN_RADIUS_AIRSHIP;
    }
  }

  /**
   * Gets the spawn positions for the Dropship.
   */
  static forDropship(): readonly Vector2[] {
    return SPAWN_POSITIONS_DROPSHIP;
  }

  /**
   * Gets the spawn center positions for the given level.
   *
   * @param level - The level whose spawn center positions should be returned
   */
  static forLevel(level: Level): Readonly<LevelSpawnPositions> {
    switch (level) {
      case Level.TheSkeld:
      case Level.AprilSkeld:
        return SPAWN_POSITIONS_SKELD;
      case Level.MiraHq:
        return SPAWN_POSITIONS_MIRA_HQ;
      case Level.Polus:
        return SPAWN_POSITIONS_POLUS;
      case Level.Airship:
        return SPAWN_POSITIONS_AIRSHIP;
    }
  }

  /**
   * Gets a spawn position in the Dropship for a player with the given ID.
   *
   * @param playerId - The ID of the player used as a chair index
   */
  static forPlayerInDropship(playerId: number): Vector2 {
    return SPAWN_POSITIONS_DROPSHIP[playerId % SPAWN_POSITIONS_DROPSHIP.length];
  }

  /**
   * Gets a spawn position on the given level for a player with the given ID.
   *
   * @param level - The level whose spawn center positions will be used
   * @param playerId - The ID of the player used as a rotation index
   * @param playerCount - The number of players in the game
   * @param isSpawn - `true` if the position is for the initial spawn position, `false` if it is for a meeting position
   */
  static forPlayerOnLevel(level: Level, playerId: number, playerCount: number, isSpawn: boolean): Vector2 {
    if (level == Level.Polus && !isSpawn) {
      if (playerId < 5) {
        return SpawnPositions.forLevel(Level.Polus).meetingOne.add(Vector2.right().multiply(playerId));
      }

      return SpawnPositions.forLevel(Level.Polus).meetingTwo.add(Vector2.right().multiply(playerId - 5));
    }

    const positions = SpawnPositions.forLevel(level);
    const center = isSpawn ? positions.initial : positions.meetingOne;
    const spawnPosition = Vector2.up()
      .rotate(((playerId - 1) * (360 / playerCount)) * (Math.PI / 180))
      .multiply(SpawnPositions.radiusForLevel(level));

    return center.add(spawnPosition).add(PLAYER_TRUE_POSITION_OFFSET);
  }
}
