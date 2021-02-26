import { Level, SystemType } from "../types/enums";

type DoorList = {
  [key in SystemType]?: readonly number[];
};

const DOORS_THE_SKELD: Readonly<DoorList> = {
  [SystemType.Electrical]: [9],
  [SystemType.LowerEngine]: [4, 11],
  [SystemType.UpperEngine]: [2, 5],
  [SystemType.Security]: [6],
  [SystemType.Medbay]: [10],
  [SystemType.Storage]: [1, 7, 12],
  [SystemType.Cafeteria]: [0, 3, 8],
};
const DOORS_MIRA_HQ: Readonly<DoorList> = {};
const DOORS_POLUS: Readonly<DoorList> = {
  [SystemType.Electrical]: [0, 1, 2],
  [SystemType.Oxygen]: [3, 4],
  [SystemType.Weapons]: [5],
  [SystemType.Communications]: [6],
  [SystemType.Office]: [7, 8],
  [SystemType.Laboratory]: [9, 10],
  [SystemType.Storage]: [11],
};
const DOORS_AIRSHIP: Readonly<DoorList> = {
  // TODO
};

const DOOR_NAMES_THE_SKELD: readonly string[] = [
  "Cafeteria",
  "Storage",
  "Upper Engine",
  "Cafeteria",
  "Lower Engine",
  "Upper Engine",
  "Security",
  "Storage",
  "Cafeteria",
  "Electrical",
  "Medbay",
  "Lower Engine",
  "Storage",
];
const DOOR_NAMES_MIRA_HQ: readonly string[] = [];
const DOOR_NAMES_POLUS: readonly string[] = [
  "Outside to Electrical",
  "Inside Electrical",
  "O2-to-Electrical Hallway (Top)",
  "O2-to-Electrical Hallway (Bottom)",
  "Outside to O2",
  "Weapons",
  "Communications",
  "Office (Right)",
  "Office (Left)",
  "Drill",
  "Outside to Medbay",
  "Storage",
];
const DOOR_NAMES_AIRSHIP: readonly string[] = [
  // TODO
];

const DOOR_COUNT_THE_SKELD: number = Object.values(DOORS_THE_SKELD).flat().length;
const DOOR_COUNT_MIRA_HQ: number = Object.values(DOORS_MIRA_HQ).flat().length;
const DOOR_COUNT_POLUS: number = Object.values(DOORS_POLUS).flat().length;
const DOOR_COUNT_AIRSHIP: number = Object.values(DOORS_AIRSHIP).flat().length;

/**
 * A helper class for retrieving door IDs for each system.
 */
export class Doors {
  /**
   * Gets each system and their respective doors for the given level.
   *
   * @param level - The level whose systems and corresponding doors should be returned
   */
  static forLevel(level: Level): Readonly<DoorList> {
    switch (level) {
      case Level.TheSkeld:
      case Level.AprilSkeld:
        return DOORS_THE_SKELD;
      case Level.MiraHq:
        return DOORS_MIRA_HQ;
      case Level.Polus:
        return DOORS_POLUS;
      case Level.Airship:
        return DOORS_AIRSHIP;
    }
  }

  /**
   * Gets the display names for the doors on the given level.
   *
   * @param level - The level whose door display names should be returned
   */
  static namesForLevel(level: Level): readonly string[] {
    switch (level) {
      case Level.TheSkeld:
      case Level.AprilSkeld:
        return DOOR_NAMES_THE_SKELD;
      case Level.MiraHq:
        return DOOR_NAMES_MIRA_HQ;
      case Level.Polus:
        return DOOR_NAMES_POLUS;
      case Level.Airship:
        return DOOR_NAMES_AIRSHIP;
    }
  }

  /**
   * Gets the number of doors on the given level.
   *
   * @param level - The level whose number of doors should be returned
   */
  static countForLevel(level: Level): number {
    switch (level) {
      case Level.TheSkeld:
      case Level.AprilSkeld:
        return DOOR_COUNT_THE_SKELD;
      case Level.MiraHq:
        return DOOR_COUNT_MIRA_HQ;
      case Level.Polus:
        return DOOR_COUNT_POLUS;
      case Level.Airship:
        return DOOR_COUNT_AIRSHIP;
    }
  }
}