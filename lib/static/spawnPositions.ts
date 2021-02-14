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

const OFFSET: Vector2 = new Vector2(0, 0.3636);

/**
 * A helper class for retrieving static data for level spawn positions.
 */
export class SpawnPositions {
  /**
   * Gets the spawn radius for The Skeld.
   */
  static spawnRadiusForSkeld(): number {
    return SPAWN_RADIUS_THE_SKELD;
  }

  /**
   * Gets the spawn radius for MIRA HQ.
   */
  static spawnRadiusForMiraHq(): number {
    return SPAWN_RADIUS_MIRA_HQ;
  }

  /**
   * Gets the spawn radius for Polus.
   */
  static spawnRadiusForPolus(): number {
    return SPAWN_RADIUS_POLUS;
  }

  /**
   * Gets the spawn radius for Airship.
   */
  static spawnRadiusForAirship(): number {
    return SPAWN_RADIUS_AIRSHIP;
  }

  /**
   * Gets the spawn radius for Airship.
   */
  static spawnRadiusForLevel(level: Level): number {
    switch (level) {
      case Level.TheSkeld:
      case Level.AprilSkeld:
        return SpawnPositions.spawnRadiusForSkeld();
      case Level.MiraHq:
        return SpawnPositions.spawnRadiusForMiraHq();
      case Level.Polus:
        return SpawnPositions.spawnRadiusForPolus();
      case Level.Airship:
        return SpawnPositions.spawnRadiusForAirship();
    }
  }

  /**
   * Gets the spawn positions for the Dropship.
   */
  static forDropship(): readonly Vector2[] {
    return SPAWN_POSITIONS_DROPSHIP;
  }

  /**
   * Gets the spawn center positions for The Skeld.
   */
  static forSkeld(): Readonly<LevelSpawnPositions> {
    return SPAWN_POSITIONS_SKELD;
  }

  /**
   * Gets the spawn center positions for MIRA HQ.
   */
  static forMiraHq(): Readonly<LevelSpawnPositions> {
    return SPAWN_POSITIONS_MIRA_HQ;
  }

  /**
   * Gets the spawn center positions for Airship.
   */
  static forPolus(): Readonly<LevelSpawnPositions> {
    return SPAWN_POSITIONS_POLUS;
  }

  /**
   * Gets the spawn center positions for Airship.
   */
  static forAirship(): Readonly<LevelSpawnPositions> {
    return SPAWN_POSITIONS_AIRSHIP;
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
        return SpawnPositions.forSkeld();
      case Level.MiraHq:
        return SpawnPositions.forMiraHq();
      case Level.Polus:
        return SpawnPositions.forPolus();
      case Level.Airship:
        return SpawnPositions.forAirship();
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
   * Gets a spawn position on The Skeld for a player with the given ID.
   *
   * @param playerId - The ID of the player used as a rotation index
   * @param playerCount - The number of players in the game
   * @param isSpawn - `true` if the position is for the initial spawn position, `false` if it is for a meeting position
   */
  static forPlayerOnSkeld(playerId: number, playerCount: number, isSpawn: boolean): Vector2 {
    return SpawnPositions.forPlayerOnLevel(Level.TheSkeld, playerId, playerCount, isSpawn);
  }

  /**
   * Gets a spawn position on MIRA HQ for a player with the given ID.
   *
   * @param playerId - The ID of the player used as a rotation index
   * @param playerCount - The number of players in the game
   * @param isSpawn - `true` if the position is for the initial spawn position, `false` if it is for a meeting position
   */
  static forPlayerOnMiraHq(playerId: number, playerCount: number, isSpawn: boolean): Vector2 {
    return SpawnPositions.forPlayerOnLevel(Level.MiraHq, playerId, playerCount, isSpawn);
  }

  /**
   * Gets a spawn position on Polus for a player with the given ID.
   *
   * @param playerId - The ID of the player used as a rotation index
   * @param playerCount - The number of players in the game
   * @param isSpawn - `true` if the position is for the initial spawn position, `false` if it is for a meeting position
   */
  static forPlayerOnPolus(playerId: number, playerCount: number, isSpawn: boolean): Vector2 {
    return SpawnPositions.forPlayerOnLevel(Level.Polus, playerId, playerCount, isSpawn);
  }

  /**
   * Gets a spawn position on Airship for a player with the given ID.
   *
   * @param playerId - The ID of the player used as a rotation index
   * @param playerCount - The number of players in the game
   * @param isSpawn - `true` if the position is for the initial spawn position, `false` if it is for a meeting position
   */
  static forPlayerOnAirship(playerId: number, playerCount: number, isSpawn: boolean): Vector2 {
    return SpawnPositions.forPlayerOnLevel(Level.Airship, playerId, playerCount, isSpawn);
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
        return SpawnPositions.forPolus().meetingOne.add(Vector2.right().multiply(playerId));
      }

      return SpawnPositions.forPolus().meetingTwo.add(Vector2.right().multiply(playerId - 5));
    }

    const positions = SpawnPositions.forLevel(level);
    const center = isSpawn ? positions.initial : positions.meetingOne;
    const spawnPosition = Vector2.up()
      .rotate((playerId - 1) * (360 / playerCount))
      .multiply(SpawnPositions.spawnRadiusForLevel(level));

    return center.add(spawnPosition).add(OFFSET);
  }
}
