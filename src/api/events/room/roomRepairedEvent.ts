// import { BaseGameRoom } from "../../game/room";
import { PlayerInstance } from "../../player";
import { CancellableEvent } from "../types";
import { Game } from "../../game";

/**
 * Fired when a sabotaged room has been repaired.
 */
export class RoomRepairedEvent extends CancellableEvent {
  /**
   * @param game - The game from which this event was fired
   * @param room - The room that was repaired
   * @param player - The player that repaired the room
   */
  constructor(
    protected readonly game: Game,
    // protected readonly room: BaseGameRoom,
    protected readonly player?: PlayerInstance,
  ) {
    super();
  }

  /**
   * Gets the game from which this event was fired.
   */
  getGame(): Game {
    return this.game;
  }

  /**
   * Gets the room that was repaired.
   */
  // getRoom(): BaseGameRoom {
  //   return this.room;
  // }

  /**
   * Gets the player that repaired the room.
   *
   * @returns The player that repaired the room, or `undefined` if it was repaired via the API
   */
  getPlayer(): PlayerInstance | undefined {
    return this.player;
  }
}