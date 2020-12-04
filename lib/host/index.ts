// TODO: Remove when finished
/* eslint-disable @typescript-eslint/no-unused-vars */
import { RepairAmount } from "../protocol/packets/rootGamePackets/gameDataPackets/rpcPackets/repairSystem";
import { InnerCustomNetworkTransform } from "../protocol/entities/player/innerCustomNetworkTransform";
import { InnerLobbyBehaviour } from "../protocol/entities/lobbyBehaviour/innerLobbyBehaviour";
import { InnerVoteBanSystem } from "../protocol/entities/gameData/innerVoteBanSystem";
import { InnerPlayerControl } from "../protocol/entities/player/innerPlayerControl";
import { InnerPlayerPhysics } from "../protocol/entities/player/innerPlayerPhysics";
import { GameDataPacket } from "../protocol/packets/rootGamePackets/gameData";
import { InnerGameData } from "../protocol/entities/gameData/innerGameData";
import { EntityLobbyBehaviour } from "../protocol/entities/lobbyBehaviour";
import { PlayerData } from "../protocol/entities/gameData/playerData";
import { EntityGameData } from "../protocol/entities/gameData";
import { DisconnectReason } from "../types/disconnectReason";
import { EntityPlayer } from "../protocol/entities/player";
import { InnerLevel } from "../protocol/entities/types";
import { Connection } from "../protocol/connection";
import { PlayerColor } from "../types/playerColor";
import { FakeHostId } from "../types/fakeHostId";
import { SystemType } from "../types/systemType";
import { Vector2 } from "../util/vector2";
import { HostInstance } from "./types";
import { Player } from "../player";
import { Room } from "../room";
import { Level } from "../types/level";
import { EntityShipStatus } from "../protocol/entities/shipStatus";
import { InnerShipStatus } from "../protocol/entities/shipStatus/innerShipStatus";
import { EntityHeadquarters } from "../protocol/entities/headquarters";
import { InnerHeadquarters } from "../protocol/entities/headquarters/innerHeadquarters";
import { EntityPlanetMap } from "../protocol/entities/planetMap";
import { InnerPlanetMap } from "../protocol/entities/planetMap/innerPlanetMap";

export class CustomHost implements HostInstance {
  public readonly id: number = FakeHostId.ServerAsHost;
  public readonly readyPlayerList: number[] = [];
  public readonly playersInScene: Map<number, string> = new Map();

  public netIdIndex = 1;
  public playerIdIndex = 0;

  constructor(
    public room: Room,
  ) {
    // TODO: Implement
  }

  sendKick(banned: boolean, reason: DisconnectReason): void {
    throw new Error("Method not implemented.");
  }

  sendLateRejection(disconnectReason: DisconnectReason): void {
    throw new Error("Method not implemented.");
  }

  handleReady(sender: Connection): void {
    this.readyPlayerList.push(sender.id);

    if (this.readyPlayerList.length == this.room.connections.length) {
      if (this.room.lobbyBehavior) {
        this.room.despawn(this.room.lobbyBehavior.lobbyBehaviour);
      }

      switch (this.room.options.options.levels[0]) {
        case Level.TheSkeld:
          // TODO: API call for AprilShipStatus
          this.room.shipStatus = new EntityShipStatus(this.room);
          this.room.shipStatus.innerNetObjects[0] = new InnerShipStatus(this.netIdIndex++, this.room.shipStatus);
          break;
        case Level.MiraHq:
          this.room.shipStatus = new EntityHeadquarters(this.room);
          this.room.shipStatus.innerNetObjects[0] = new InnerHeadquarters(this.netIdIndex++, this.room.shipStatus);
          break;
        case Level.Polus:
          this.room.shipStatus = new EntityPlanetMap(this.room);
          this.room.shipStatus.innerNetObjects[0] = new InnerPlanetMap(this.netIdIndex++, this.room.shipStatus);
          break;
      }

      this.room.connections.forEach(connection => {
        connection.write(new GameDataPacket([ this.room.shipStatus!.spawn() ], this.room.code));
      });
    }
  }

  handleSceneChange(sender: Connection, sceneName: string): void {
    if (sceneName !== "OnlineGame") {
      return;
    }

    if (this.playersInScene.get(sender.id)) {
      throw new Error("Sender has already changed scene");
    }

    const newPlayerId = this.playerIdIndex++;

    this.playersInScene.set(sender.id, sceneName);

    if (!this.room.lobbyBehavior) {
      this.room.lobbyBehavior = new EntityLobbyBehaviour(this.room);
      this.room.lobbyBehavior.innerNetObjects = [
        new InnerLobbyBehaviour(this.netIdIndex++, this.room.lobbyBehavior),
      ];
    }

    sender.write(new GameDataPacket([ this.room.lobbyBehavior.spawn() ], this.room.code));

    if (!this.room.gameData) {
      this.room.gameData = new EntityGameData(this.room);
      this.room.gameData.innerNetObjects = [
        new InnerGameData(this.netIdIndex++, this.room.gameData, []),
        new InnerVoteBanSystem(this.netIdIndex++, this.room.gameData),
      ];
    }

    sender.write(new GameDataPacket([ this.room.gameData.spawn() ], this.room.code));

    const entity = new EntityPlayer(this.room);

    entity.owner = sender.id;
    entity.innerNetObjects = [
      new InnerPlayerControl(this.netIdIndex++, entity, true, newPlayerId),
      new InnerPlayerPhysics(this.netIdIndex++, entity),
      new InnerCustomNetworkTransform(this.netIdIndex++, entity, 5, new Vector2(0, 0), new Vector2(0, 0)),
    ];

    const player = new Player(entity);

    console.log("ABC DEF");

    console.log(this.room.players);

    this.room.players.forEach(testplayer => {
      sender.write(new GameDataPacket([ player.gameObject.spawn() ], this.room.code));
    });

    this.room.players.push(player);

    console.log(this.room);

    console.log("A");

    this.room.sendRootGamePacket(new GameDataPacket([ player.gameObject.spawn() ], this.room.code));

    console.log("B");

    player.gameObject.playerControl.syncSettings(this.room.options, this.room.connections);

    const playerData = new PlayerData(
      player.gameObject.playerControl.playerId,
      "",
      PlayerColor.Red,
      0,
      0,
      0,
      false,
      false,
      false,
      [],
    );

    this.room.gameData.gameData.updateGameData([ playerData ], this.room.connections);

    player.gameObject.playerControl.isNew = false;
  }

  handleCheckName(sender: InnerPlayerControl, name: string): void {
    let checkName: string = name;
    let nameTaken: boolean = this.isNameTaken(checkName);
    let index = 1;

    while (nameTaken) {
      checkName = `${name} ${index++}`;

      nameTaken = this.isNameTaken(checkName);
    }

    sender.setName(checkName, this.room.connections);
  }

  handleCheckColor(sender: InnerPlayerControl, color: PlayerColor): void {
    const takenColors = this.getTakenColors();

    let setColor: PlayerColor = color;

    if (this.room.players.length <= 12) {
      while (takenColors.indexOf(setColor) != -1) {
        for (let i = 0; i < 12; i++) {
          if (takenColors.indexOf(i) == -1) {
            setColor = i;
          }
        }
      }
    } else {
      setColor = PlayerColor.ForteGreen;
    }

    sender.setColor(setColor, this.room.connections);
  }

  handleReportDeadBody(sender: InnerPlayerControl, victimPlayerId?: number): void {
    throw new Error("Method not implemented.");
  }

  handleRepairSystem(sender: InnerLevel, systemId: SystemType, playerControlNetId: number, amount: RepairAmount): void {
    throw new Error("Method not implemented.");
  }

  handleCloseDoorsOfType(sender: InnerLevel, systemId: SystemType): void {
    throw new Error("Method not implemented.");
  }

  // SendWaitingForHost is not needed on a HostImplementation
  // as it would not be used.

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  sendWaitingForHost(): void { }

  private isNameTaken(name: string): boolean {
    if (!this.room.gameData) {
      throw new Error("isNameTaken called for room without a GameData instance");
    }

    return !!this.room.gameData.gameData.players.find(player => player.name == name);
  }

  private getTakenColors(): PlayerColor[] {
    if (!this.room.gameData) {
      throw new Error("getTakenColors called for room without a GameData instance");
    }

    return this.room.gameData.gameData.players.map(player => player.color);
  }
}
