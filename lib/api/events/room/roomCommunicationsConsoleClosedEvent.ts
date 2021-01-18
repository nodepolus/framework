import { Game } from "../../game";

/**
 * Fired when a communications console has been closed by a player.
 */
export class RoomCommunicationsConsoleClosedEvent {
  constructor(
    private readonly game: Game,
    private readonly console: number,
  ) {}

  /**
   * Gets the game from which this event was fired.
   */
  getGame(): Game {
    return this.game;
  }

  /**
   * Gets the communications console that was closed.
   */
  getConsole(): number {
    return this.console;
  }
}