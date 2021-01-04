import { PlayerInstance } from "../../player";
import { Game } from "../../game";

/**
 * Fired when a game has started.
 */
export class GameStartedEvent {
  constructor(
    private readonly game: Game,
    private impostors: PlayerInstance[],
  ) {}

  getGame(): Game {
    return this.game;
  }

  getImpostors(): PlayerInstance[] {
    return this.impostors;
  }

  setImpostors(impostors: PlayerInstance[]): void {
    this.impostors = impostors;
  }
}
