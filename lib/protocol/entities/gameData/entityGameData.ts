import { SpawnFlag, SpawnType } from "../../../types/enums";
import { GLOBAL_OWNER } from "../../../util/constants";
import { InnerGameData, InnerVoteBanSystem } from ".";
import { BaseInnerNetEntity } from "../baseEntity";
import { LobbyInstance } from "../../../api/lobby";
import { PlayerData } from "./types";

export class EntityGameData extends BaseInnerNetEntity {
  public innerNetObjects: [ InnerGameData, InnerVoteBanSystem ];

  get gameData(): InnerGameData {
    return this.innerNetObjects[0];
  }

  get voteBanSystem(): InnerVoteBanSystem {
    return this.innerNetObjects[1];
  }

  constructor(
    lobby: LobbyInstance,
    players: PlayerData[] = [],
    gameDataNetId: number = lobby.getHostInstance().getNextNetId(),
    voteBanSystemNetId: number = lobby.getHostInstance().getNextNetId(),
  ) {
    super(SpawnType.GameData, lobby, GLOBAL_OWNER, SpawnFlag.None);

    this.innerNetObjects = [
      new InnerGameData(this, players, gameDataNetId),
      new InnerVoteBanSystem(this, voteBanSystemNetId),
    ];
  }

  despawn(): void {
    this.lobby.despawn(this.gameData);
    this.lobby.deleteGameData();
  }
}
