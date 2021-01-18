import { Connection } from "../../../protocol/connection";
import { LobbyInstance } from "../../lobby";
import { Vector2 } from "../../../types";

/**
 * Fired when a player is being spawned in a lobby.
 */
export class PlayerSpawnedEvent {
  constructor(
    private readonly connection: Connection | undefined,
    private readonly lobby: LobbyInstance,
    private readonly playerId: number,
    private newPlayer: boolean,
    private position: Vector2,
  ) {}

  /**
   * Gets the connection that the player belongs to.
   *
   * @returns The connection that the player belongs to, or `undefined` if the player was spawned in via the API
   */
  getConnection(): Connection | undefined {
    return this.connection;
  }

  /**
   * Gets the lobby in which the player is being spawned.
   */
  getLobby(): LobbyInstance {
    return this.lobby;
  }

  /**
   * Gets the ID of the player being spawned.
   */
  getPlayerId(): number {
    return this.playerId;
  }

  /**
   * Gets whether or not the player is considered new and should hop out of a dropship chair.
   *
   * @returns `true` if the player is new, `false` if not
   */
  isNew(): boolean {
    return this.newPlayer;
  }

  /**
   * Sets whether or not the player is considered new and should hop out of a dropship chair.
   *
   * @param isNew `true` if the player is new, `false` if now
   */
  setNew(isNew: boolean = true): void {
    this.newPlayer = isNew;
  }

  /**
   * Gets the player's spawn position.
   */
  getPosition(): Vector2 {
    return this.position;
  }

  /**
   * Sets the player's spawn position.
   *
   * @param position The player's new spawn position
   */
  setPosition(position: Vector2): void {
    this.position = position;
  }
}