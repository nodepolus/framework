import { TaskLength, LevelTask, TASKS_THE_SKELD, TASKS_MIRA_HQ, TASKS_POLUS, TASKS_AIRSHIP } from "../types/levelTask";
import { InnerSkeldAprilShipStatus } from "../protocol/entities/skeldAprilShipStatus/innerSkeldAprilShipStatus";
import { MovingPlatformSystem } from "../protocol/entities/baseShipStatus/systems/movingPlatformSystem";
import { SecurityCameraSystem } from "../protocol/entities/baseShipStatus/systems/securityCameraSystem";
import { InnerCustomNetworkTransform } from "../protocol/entities/player/innerCustomNetworkTransform";
import { HudOverrideSystem } from "../protocol/entities/baseShipStatus/systems/hudOverrideSystem";
import { InnerPolusShipStatus } from "../protocol/entities/polusShipStatus/innerPolusShipStatus";
import { InnerSkeldShipStatus } from "../protocol/entities/skeldShipStatus/innerSkeldShipStatus";
import { LaboratorySystem } from "../protocol/entities/baseShipStatus/systems/laboratorySystem";
import { InnerLobbyBehaviour } from "../protocol/entities/lobbyBehaviour/innerLobbyBehaviour";
import { InnerMiraShipStatus } from "../protocol/entities/miraShipStatus/innerMiraShipStatus";
import { InnerMeetingHud, VoteState } from "../protocol/entities/meetingHud/innerMeetingHud";
import { DeconTwoSystem } from "../protocol/entities/baseShipStatus/systems/deconTwoSystem";
import { LifeSuppSystem } from "../protocol/entities/baseShipStatus/systems/lifeSuppSystem";
import { SabotageSystem } from "../protocol/entities/baseShipStatus/systems/sabotageSystem";
import { InnerAirshipStatus } from "../protocol/entities/airshipStatus/innerAirshipStatus";
import { MedScanSystem } from "../protocol/entities/baseShipStatus/systems/medScanSystem";
import { ReactorSystem } from "../protocol/entities/baseShipStatus/systems/reactorSystem";
import { SwitchSystem } from "../protocol/entities/baseShipStatus/systems/switchSystem";
import { EntitySkeldAprilShipStatus } from "../protocol/entities/skeldAprilShipStatus";
import { DeconSystem } from "../protocol/entities/baseShipStatus/systems/deconSystem";
import { DoorsSystem } from "../protocol/entities/baseShipStatus/systems/doorsSystem";
import { HqHudSystem } from "../protocol/entities/baseShipStatus/systems/hqHudSystem";
import { InnerVoteBanSystem } from "../protocol/entities/gameData/innerVoteBanSystem";
import { InternalSystemType } from "../protocol/entities/baseShipStatus/systems/type";
import { InnerPlayerControl } from "../protocol/entities/player/innerPlayerControl";
import { InnerPlayerPhysics } from "../protocol/entities/player/innerPlayerPhysics";
import { SabotageSystemHandler } from "./systemHandlers/sabotageSystemHandler";
import { EntityPolusShipStatus } from "../protocol/entities/polusShipStatus";
import { EntitySkeldShipStatus } from "../protocol/entities/skeldShipStatus";
import { InnerGameData } from "../protocol/entities/gameData/innerGameData";
import { EntityLobbyBehaviour } from "../protocol/entities/lobbyBehaviour";
import { EntityMiraShipStatus } from "../protocol/entities/miraShipStatus";
import { EntityAirshipStatus } from "../protocol/entities/airshipStatus";
import { PlayerData } from "../protocol/entities/gameData/playerData";
import { AutoDoorsHandler } from "./systemHandlers/autoDoorsHandler";
import { StartGamePacket } from "../protocol/packets/root/startGame";
import { GameDataPacket } from "../protocol/packets/root/gameData";
import { EntityMeetingHud } from "../protocol/entities/meetingHud";
import { shuffleArrayClone, shuffleArray } from "../util/shuffle";
import { EndGamePacket } from "../protocol/packets/root/endGame";
import { EntityGameData } from "../protocol/entities/gameData";
import { DeconHandler } from "./systemHandlers/deconHandler";
import { DisconnectReason } from "../types/disconnectReason";
import { DoorsHandler } from "./systemHandlers/doorsHandler";
import { EntityPlayer } from "../protocol/entities/player";
import { GameOverReason } from "../types/gameOverReason";
import { InnerLevel } from "../protocol/entities/types";
import { FakeClientId } from "../types/fakeClientId";
import { Connection } from "../protocol/connection";
import { PlayerColor } from "../types/playerColor";
import { SystemsHandler } from "./systemHandlers";
import { GLOBAL_OWNER } from "../util/constants";
import { LimboState } from "../types/limboState";
import { SystemType } from "../types/systemType";
import { GameState } from "../types/gameState";
import { TaskType } from "../types/taskType";
import { Vector2 } from "../util/vector2";
import { Level } from "../types/level";
import { HostInstance } from "./types";
import { Player } from "../player";
import { Lobby } from "../lobby";
import {
  NormalCommunicationsAmount,
  MiraCommunicationsAmount,
  DecontaminationAmount,
  ElectricalAmount,
  PolusDoorsAmount,
  SabotageAmount,
  SecurityAmount,
  ReactorAmount,
  MedbayAmount,
  OxygenAmount,
  RepairAmount,
} from "../protocol/packets/rpc/repairSystem";

export class CustomHost implements HostInstance {
  public readonly id: number = FakeClientId.ServerAsHost;

  public readyPlayerList: number[] = [];
  public playersInScene: Map<number, string> = new Map();
  public systemsHandler?: SystemsHandler;
  public sabotageHandler?: SabotageSystemHandler;
  public deconHandlers: DeconHandler[] = [];
  public doorHandler: DoorsHandler | AutoDoorsHandler | undefined;

  private netIdIndex = 1;
  private counterSequenceId = 0;
  private countdownInterval: NodeJS.Timeout | undefined;
  private meetingHudTimeout: NodeJS.Timeout | undefined;

  constructor(
    public lobby: Lobby,
  ) {}

  getNextNetId(): number {
    return this.netIdIndex++;
  }

  /* eslint-disable @typescript-eslint/no-empty-function */
  sendKick(_banned: boolean, _reason: DisconnectReason): void {}
  sendLateRejection(_disconnectReason: DisconnectReason): void {}
  sendWaitingForHost(): void {}
  /* eslint-enable @typescript-eslint/no-empty-function */

  handleReady(sender: Connection): void {
    this.readyPlayerList.push(sender.id);

    /**
     * TODO:
     * Add disconnection logic to timeout players who take too long to be ready.
     * This **SHOULD NOT** be allowed because literally anybody who can read
     * could browse the source or check sus.wiki to figure this out and lock up
     * an entire server if they really wanted to.
     */

    if (this.readyPlayerList.length == this.lobby.connections.length) {
      if (this.lobby.lobbyBehavior) {
        this.lobby.despawn(this.lobby.lobbyBehavior.lobbyBehaviour);
      }

      switch (this.lobby.options.options.levels[0]) {
        case Level.TheSkeld:
          this.lobby.shipStatus = new EntitySkeldShipStatus(this.lobby);
          this.lobby.shipStatus.owner = GLOBAL_OWNER;
          this.lobby.shipStatus.innerNetObjects = [
            new InnerSkeldShipStatus(this.getNextNetId(), this.lobby.shipStatus),
          ];
          break;
        case Level.AprilSkeld:
          this.lobby.shipStatus = new EntitySkeldAprilShipStatus(this.lobby);
          this.lobby.shipStatus.owner = GLOBAL_OWNER;
          this.lobby.shipStatus.innerNetObjects = [
            new InnerSkeldAprilShipStatus(this.getNextNetId(), this.lobby.shipStatus),
          ];
          break;
        case Level.MiraHq:
          this.lobby.shipStatus = new EntityMiraShipStatus(this.lobby);
          this.lobby.shipStatus.owner = GLOBAL_OWNER;
          this.lobby.shipStatus.innerNetObjects = [
            new InnerMiraShipStatus(this.getNextNetId(), this.lobby.shipStatus),
          ];
          break;
        case Level.Polus:
          this.lobby.shipStatus = new EntityPolusShipStatus(this.lobby);
          this.lobby.shipStatus.owner = GLOBAL_OWNER;
          this.lobby.shipStatus.innerNetObjects = [
            new InnerPolusShipStatus(this.getNextNetId(), this.lobby.shipStatus),
          ];
          break;
        case Level.Airship:
          this.lobby.shipStatus = new EntityAirshipStatus(this.lobby);
          this.lobby.shipStatus.owner = GLOBAL_OWNER;
          this.lobby.shipStatus.innerNetObjects = [
            new InnerAirshipStatus(this.getNextNetId(), this.lobby.shipStatus),
          ];
          break;
      }

      this.systemsHandler = new SystemsHandler(this);
      this.sabotageHandler = new SabotageSystemHandler(this);

      switch (this.lobby.options.options.levels[0]) {
        case Level.TheSkeld:
          this.deconHandlers = [];
          this.doorHandler = new AutoDoorsHandler(this, this.lobby.shipStatus.innerNetObjects[0]);
          break;
        case Level.AprilSkeld:
          this.deconHandlers = [];
          this.doorHandler = new AutoDoorsHandler(this, this.lobby.shipStatus.innerNetObjects[0]);
          break;
        case Level.MiraHq:
          this.deconHandlers = [
            new DeconHandler(this, this.lobby.shipStatus.innerNetObjects[0].systems[InternalSystemType.Decon] as DeconSystem),
          ];
          break;
        case Level.Polus:
          this.deconHandlers = [
            new DeconHandler(this, this.lobby.shipStatus.innerNetObjects[0].systems[InternalSystemType.Decon] as DeconSystem),
            new DeconHandler(this, this.lobby.shipStatus.innerNetObjects[0].systems[InternalSystemType.Decon2] as DeconTwoSystem),
          ];
          this.doorHandler = new DoorsHandler(this, this.lobby.shipStatus.innerNetObjects[0]);
          break;
        case Level.Airship:
          this.deconHandlers = [];
          this.doorHandler = new DoorsHandler(this, this.lobby.shipStatus.innerNetObjects[0]);
          break;
      }

      if (!this.lobby.gameData) {
        throw new Error("Attempted to start game without a GameData instance");
      }

      this.lobby.sendRootGamePacket(new GameDataPacket([this.lobby.shipStatus!.spawn()], this.lobby.code));

      this.setInfected(this.lobby.options.options.impostorCount);

      // TODO: Uncomment when removing the for loop below
      // this.setTasks();

      // TODO: Remove -- debug task list for medbay scan on all 3 maps
      for (let i = 0; i < this.lobby.players.length; i++) {
        this.lobby.gameData.gameData.setTasks(this.lobby.players[i].id, [25, 4, 2], this.lobby.connections);
      }

      this.lobby.gameData.gameData.updateGameData(this.lobby.gameData.gameData.players, this.lobby.connections);

      this.lobby.gameState = GameState.Started;
    }
  }

  async handleSceneChange(sender: Connection, sceneName: string): Promise<void> {
    this.stopCountdown();

    if (sceneName !== "OnlineGame") {
      return;
    }

    if (this.playersInScene.get(sender.id)) {
      throw new Error("Sender has already changed scene");
    }

    const newPlayerId = this.getNextPlayerId();

    if (newPlayerId == -1) {
      sender.sendLateRejection(DisconnectReason.gameFull());
    }

    this.playersInScene.set(sender.id, sceneName);

    if (!this.lobby.lobbyBehavior) {
      this.lobby.lobbyBehavior = new EntityLobbyBehaviour(this.lobby);
      this.lobby.lobbyBehavior.owner = GLOBAL_OWNER;
      this.lobby.lobbyBehavior.innerNetObjects = [
        new InnerLobbyBehaviour(this.getNextNetId(), this.lobby.lobbyBehavior),
      ];
    }

    sender.write(new GameDataPacket([this.lobby.lobbyBehavior.spawn()], this.lobby.code));

    if (!this.lobby.gameData) {
      this.lobby.gameData = new EntityGameData(this.lobby);
      this.lobby.gameData.owner = GLOBAL_OWNER;
      this.lobby.gameData.innerNetObjects = [
        new InnerGameData(this.getNextNetId(), this.lobby.gameData, []),
        new InnerVoteBanSystem(this.getNextNetId(), this.lobby.gameData),
      ];
    }

    sender.write(new GameDataPacket([this.lobby.gameData.spawn()], this.lobby.code));

    const entity = new EntityPlayer(this.lobby);

    entity.owner = sender.id;
    entity.innerNetObjects = [
      new InnerPlayerControl(this.getNextNetId(), entity, true, newPlayerId),
      new InnerPlayerPhysics(this.getNextNetId(), entity),
      new InnerCustomNetworkTransform(this.getNextNetId(), entity, 5, new Vector2(0, 0), new Vector2(0, 0)),
    ];

    const player = new Player(entity);

    for (let i = 0; i < this.lobby.players.length; i++) {
      sender.write(new GameDataPacket([this.lobby.players[i].gameObject.spawn()], this.lobby.code));
    }

    this.lobby.players.push(player);

    await this.lobby.sendRootGamePacket(new GameDataPacket([player.gameObject.spawn()], this.lobby.code));

    player.gameObject.playerControl.syncSettings(this.lobby.options, [sender]);

    this.confirmPlayerData(sender, player);

    player.gameObject.playerControl.isNew = false;
  }

  handleCheckName(sender: InnerPlayerControl, name: string): void {
    let checkName: string = name;
    let index = 1;

    const owner = this.lobby.findConnection(sender.parent.owner);

    if (!owner) {
      throw new Error("Received CheckName from an InnerPlayerControl without an owner");
    }

    this.confirmPlayerData(owner, new Player(sender.parent));

    while (this.isNameTaken(checkName)) {
      checkName = `${name} ${index++}`;
    }

    sender.setName(checkName, this.lobby.connections);

    this.lobby.finishedSpawningPlayer(owner);

    if (!this.lobby.isSpawningPlayers()) {
      this.lobby.reapplyActingHosts();
    }
  }

  handleCheckColor(sender: InnerPlayerControl, color: PlayerColor): void {
    const takenColors = this.getTakenColors();
    let setColor: PlayerColor = color;

    const owner = this.lobby.findConnection(sender.parent.owner);

    if (!owner) {
      throw new Error("Received CheckColor from an InnerPlayerControl without an owner");
    }

    this.confirmPlayerData(owner, new Player(sender.parent));

    if (this.lobby.players.length <= 12) {
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

    sender.setColor(setColor, this.lobby.connections);
  }

  handleCompleteTask(sender: InnerPlayerControl, taskIndex: number): void {
    if (!this.lobby.gameData) {
      throw new Error("Received CompleteTask without a GameData instance");
    }

    const playerIndex = this.lobby.gameData.gameData.players.findIndex(playerData => playerData.id == sender.playerId);

    if (playerIndex == -1) {
      throw new Error("Received CompleteTask from a connection without an InnerPlayerControl instance");
    }

    this.lobby.gameData.gameData.players[playerIndex].completeTask(taskIndex);

    const crewmates = this.lobby.gameData.gameData.players.filter(playerData => !playerData.isImpostor);

    if (crewmates.every(crewmate => crewmate.isDoneWithTasks())) {
      this.endGame(GameOverReason.CrewmatesByTask);
    }
  }

  handleMurderPlayer(_sender: InnerPlayerControl, _victimPlayerControlNetId: number): void {
    if (this.shouldEndGame()) {
      this.endGame(GameOverReason.ImpostorsByKill);
    }
  }

  handleImpostorDeath(): void {
    if (this.shouldEndGame()) {
      this.endGame(GameOverReason.CrewmatesByVote);
    }
  }

  handleReportDeadBody(sender: InnerPlayerControl, victimPlayerId?: number): void {
    if (!this.lobby.gameData) {
      throw new Error("Received ReportDeadBody without a GameData instance");
    }

    sender.startMeeting(victimPlayerId, this.lobby.connections);

    this.lobby.meetingHud = new EntityMeetingHud(this.lobby);
    this.lobby.meetingHud.innerNetObjects = [
      new InnerMeetingHud(this.getNextNetId(), this.lobby.meetingHud),
    ];
    this.lobby.meetingHud.innerNetObjects[0].playerStates = Array(this.lobby.gameData.gameData.players.length);

    for (let i = 0; i < this.lobby.gameData.gameData.players.length; i++) {
      const player = this.lobby.gameData.gameData.players[i];

      this.lobby.meetingHud!.innerNetObjects[0].playerStates[player.id] = new VoteState(
        player!.id == sender.playerId,
        false,
        player.isDead || player.isDisconnected,
        -1,
      );
    }

    this.lobby.sendRootGamePacket(new GameDataPacket([
      this.lobby.meetingHud.spawn(),
    ], this.lobby.code));

    this.meetingHudTimeout = setTimeout(this.endMeeting, (this.lobby.options.options.votingTime + this.lobby.options.options.discussionTime) * 1000);
  }

  endMeeting(): void {
    if (!this.lobby.meetingHud) {
      throw new Error("Attempted to end a meeting without a MeetingHud instance");
    }

    if (!this.lobby.gameData) {
      throw new Error("Attempted to end a meeting without a GameData instance");
    }

    const oldData = this.lobby.meetingHud.meetingHud.clone();
    const votes: Map<number, number[]> = new Map();

    for (let i = 0; i < this.lobby.gameData.gameData.players.length; i++) {
      const player = this.lobby.gameData.gameData.players[i];
      const state = this.lobby.meetingHud!.meetingHud.playerStates[player.id];

      if (!votes.has(state.votedFor)) {
        votes.set(state.votedFor, []);
      }

      votes.get(state.votedFor)!.push(player.id);
    }

    const voteCounts = [...votes.values()].map(playersVotedFor => playersVotedFor.length);
    const largestVoteCount = Math.max(...voteCounts);
    const allLargestVotes = [...votes.entries()].filter(entry => entry[1].length == largestVoteCount);

    if (allLargestVotes.length == 1 && allLargestVotes[0][0] != -1) {
      this.lobby.meetingHud.meetingHud.votingComplete(this.lobby.meetingHud.meetingHud.playerStates, true, allLargestVotes[0][0], false, this.lobby.connections);
    } else {
      this.lobby.meetingHud.meetingHud.votingComplete(this.lobby.meetingHud.meetingHud.playerStates, false, 255, true, this.lobby.connections);
    }

    const exiledPlayer = this.lobby.gameData.gameData.players.find(playerData => playerData.id == allLargestVotes[0][0]);

    if (allLargestVotes[0][0] != -1 && allLargestVotes.length == 1) {
      if (!exiledPlayer) {
        throw new Error("Exiled player has no data stored in GameData instance");
      }

      exiledPlayer.isDead = true;
    }

    this.lobby.sendRootGamePacket(new GameDataPacket([
      this.lobby.meetingHud.meetingHud.data(oldData),
    ], this.lobby.code));

    setTimeout(() => {
      if (!this.lobby.meetingHud) {
        throw new Error("Attempted to end a meeting without a MeetingHud instance");
      }

      this.lobby.meetingHud.meetingHud.close(this.lobby.connections);

      delete this.lobby.meetingHud;

      setTimeout(() => {
        if (this.shouldEndGame()) {
          if (!this.lobby.gameData) {
            throw new Error("Attempted to end a meeting without a GameData instance");
          }

          if (exiledPlayer!.isImpostor) {
            this.endGame(GameOverReason.CrewmatesByVote);
          } else {
            this.endGame(GameOverReason.ImpostorsByVote);
          }
        }
      // This timing of 8.5 seconds is based on in-game observations and may be
      // slightly inaccurate due to network latency and fluctuating framerates
      }, 8500);
    }, 5000);
  }

  handleCastVote(votingPlayerId: number, suspectPlayerId: number): void {
    if (!this.lobby.meetingHud) {
      throw new Error("Received CastVote without a MeetingHud instance");
    }

    const oldMeetingHud = this.lobby.meetingHud.meetingHud.clone();

    this.lobby.meetingHud.meetingHud.playerStates[votingPlayerId].votedFor = suspectPlayerId;
    this.lobby.meetingHud.meetingHud.playerStates[votingPlayerId].didVote = true;

    this.lobby.sendRootGamePacket(new GameDataPacket([
      this.lobby.meetingHud.meetingHud.data(oldMeetingHud),
    ], this.lobby.code));

    if (this.meetingHudTimeout && this.lobby.meetingHud.meetingHud.playerStates.every(p => p.didVote || p.isDead)) {
      this.endMeeting();
      clearInterval(this.meetingHudTimeout);
    }
  }

  handleRepairSystem(_sender: InnerLevel, systemId: SystemType, playerControlNetId: number, amount: RepairAmount): void {
    if (!this.lobby.shipStatus) {
      throw new Error("Received RepairSystem without a ShipStatus instance");
    }

    const system = this.lobby.shipStatus.innerNetObjects[0].getSystemFromType(systemId);
    const player = this.lobby.players.find(thePlayer => thePlayer.gameObject.playerControl.id == playerControlNetId);
    const level = this.lobby.options.options.levels[0];

    if (!player) {
      throw new Error(`Received RepairSystem from a non-player InnerNetObject: ${playerControlNetId}`);
    }

    switch (system.type) {
      case SystemType.Electrical:
        this.systemsHandler!.repairSwitch(player, system as SwitchSystem, amount as ElectricalAmount);
        break;
      case SystemType.Medbay:
        this.systemsHandler!.repairMedbay(player, system as MedScanSystem, amount as MedbayAmount);
        break;
      case SystemType.Oxygen:
        this.systemsHandler!.repairOxygen(player, system as LifeSuppSystem, amount as OxygenAmount);
        break;
      case SystemType.Reactor:
        this.systemsHandler!.repairReactor(player, system as ReactorSystem, amount as ReactorAmount);
        break;
      case SystemType.Laboratory:
        this.systemsHandler!.repairReactor(player, system as LaboratorySystem, amount as ReactorAmount);
        break;
      case SystemType.Security:
        this.systemsHandler!.repairSecurity(player, system as SecurityCameraSystem, amount as SecurityAmount);
        break;
      case SystemType.Doors:
        if (level == Level.Polus) {
          this.systemsHandler!.repairPolusDoors(player, system as DoorsSystem, amount as PolusDoorsAmount);
        } else {
          throw new Error(`Received RepairSystem for Doors on an unimplemented level: ${level as Level} (${Level[level]})`);
        }
        break;
      case SystemType.Communications:
        if (level == Level.MiraHq) {
          this.systemsHandler!.repairHqHud(player, system as HqHudSystem, amount as MiraCommunicationsAmount);
        } else {
          this.systemsHandler!.repairHudOverride(player, system as HudOverrideSystem, amount as NormalCommunicationsAmount);
        }
        break;
      case SystemType.Decontamination:
        this.systemsHandler!.repairDecon(player, system as DeconSystem, amount as DecontaminationAmount);
        break;
      case SystemType.Decontamination2:
        this.systemsHandler!.repairDecon(player, system as DeconTwoSystem, amount as DecontaminationAmount);
        break;
      case SystemType.Sabotage:
        this.systemsHandler!.repairSabotage(player, system as SabotageSystem, amount as SabotageAmount);
        break;
      default:
        throw new Error(`Received RepairSystem packet for an unimplemented SystemType: ${system.type} (${SystemType[system.type]})`);
    }
  }

  handleCloseDoorsOfType(_sender: InnerLevel, systemId: SystemType): void {
    if (!this.doorHandler) {
      throw new Error("Received CloseDoorsOfType without a door handler");
    }

    this.doorHandler.closeDoor(this.doorHandler.getDoorsForSystem(systemId));
    this.doorHandler.setSystemTimeout(systemId, 30);
  }

  handleSetStartCounter(sequenceId: number, timeRemaining: number): void {
    // TODO: This breaks the logic of stopping the counter when someone joins or leaves
    if (timeRemaining == -1) {
      return;
    }

    if (this.counterSequenceId < sequenceId && this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }

    if (timeRemaining == 5 && this.counterSequenceId != sequenceId) {
      this.lobby.removeActingHosts(true);
      // TODO: Config option
      this.startCountdown(5);
    }
  }

  handleDisconnect(connection: Connection): void {
    if (this.lobby.gameState == GameState.NotStarted) {
      this.stopCountdown();
    }

    if (!this.lobby.gameData) {
      if (this.lobby.gameState == GameState.NotStarted || this.lobby.gameState == GameState.Started) {
        throw new Error("Received Disconnect without a GameData instance");
      }

      return;
    }

    const player = this.lobby.findPlayerByConnection(connection);

    if (!player) {
      console.warn("Received disconnect from connection without a player");

      return;
    }

    const playerIndex = this.lobby.gameData.gameData.players.findIndex(playerData => playerData.id == player.id);
    const playerData = this.lobby.gameData.gameData.players[playerIndex];

    if (this.lobby.gameState == GameState.Started) {
      playerData.isDisconnected = true;
    } else {
      this.lobby.gameData.gameData.players.splice(playerIndex, 1);
    }

    this.lobby.gameData.gameData.updateGameData(this.lobby.gameData.gameData.players, this.lobby.connections);

    if (this.shouldEndGame()) {
      if (playerData.isImpostor) {
        this.endGame(GameOverReason.ImpostorDisconnect);
      } else {
        this.endGame(GameOverReason.CrewmateDisconnect);
      }
    }
  }

  handleUsePlatform(sender: InnerPlayerControl): void {
    if (!this.lobby.shipStatus) {
      throw new Error("Received UsePlatform without a ShipStatus instance");
    }

    const oldData = this.lobby.shipStatus.innerNetObjects[0].clone();
    const movingPlatform = this.lobby.shipStatus.innerNetObjects[0].systems[InternalSystemType.MovingPlatform] as MovingPlatformSystem;

    movingPlatform.innerPlayerControlNetId = sender.parent.playerControl.id;
    movingPlatform.side = (movingPlatform.side + 1) % 2;

    movingPlatform.sequenceId++;

    //@ts-ignore TODO: Talk to cody about this?
    const data = this.lobby.shipStatus.innerNetObjects[0].getData(oldData);

    this.lobby.sendRootGamePacket(new GameDataPacket([data], this.lobby.code));
  }

  stopCountdown(): void {
    if (this.lobby.players.length > 0) {
      this.lobby.players[0].gameObject.playerControl.setStartCounter(this.counterSequenceId += 5, -1, this.lobby.connections);
    }

    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  startCountdown(count: number): void {
    let currentCount = count;
    const countdownFunction = (): void => {
      const time = currentCount--;

      this.lobby.players[0].gameObject.playerControl.setStartCounter(this.counterSequenceId += 5, time, this.lobby.connections);

      if (time <= 0) {
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
        }

        this.startGame();
      }
    };

    countdownFunction();

    this.countdownInterval = setInterval(countdownFunction, 1000);
  }

  startGame(): void {
    this.lobby.sendRootGamePacket(new StartGamePacket(this.lobby.code));
  }

  setInfected(infectedCount: number): void {
    const shuffledPlayers = shuffleArrayClone(this.lobby.players);
    const impostors = new Array(infectedCount);

    for (let i = 0; i < infectedCount; i++) {
      impostors[i] = shuffledPlayers[i].id;
    }

    this.lobby.players[0].gameObject.playerControl.setInfected(impostors, this.lobby.connections);
  }

  setTasks(): void {
    const options = this.lobby.options.options;
    const level = options.levels[0];
    const numCommon = options.commonTasks;
    const numLong = options.longTasks;
    // Minimum of 1 short task
    const numShort = numCommon + numLong + options.shortTasks > 0 ? options.shortTasks : 1;

    let allTasks: LevelTask[];

    switch (level) {
      case Level.TheSkeld:
        allTasks = TASKS_THE_SKELD;
        break;
      case Level.MiraHq:
        allTasks = TASKS_MIRA_HQ;
        break;
      case Level.Polus:
        allTasks = TASKS_POLUS;
        break;
      case Level.Airship:
        allTasks = TASKS_AIRSHIP;
        break;
      default:
        throw new Error(`Attempted to set tasks for an unimplemented level: ${level as Level} (${Level[level]})`);
    }

    const allCommon: LevelTask[] = [];
    const allShort: LevelTask[] = [];
    const allLong: LevelTask[] = [];

    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];

      switch (task.length) {
        case TaskLength.Common:
          allCommon.push(task);
          break;
        case TaskLength.Short:
          allShort.push(task);
          break;
        case TaskLength.Long:
          allLong.push(task);
          break;
      }
    }

    // Used to store the currently assigned tasks to try to prevent
    // players from having the exact same tasks
    const used: Set<TaskType> = new Set();
    // The array of tasks for the player
    const tasks: LevelTask[] = [];

    // Add common tasks
    this.addTasksFromList({ val: 0 }, numCommon, tasks, used, allCommon);

    for (let i = 0; i < numCommon; i++) {
      if (allCommon.length == 0) {
        // Not enough common tasks
        break;
      }

      const index = Math.floor(Math.random() * allCommon.length);

      tasks.push(allCommon[index]);
      allCommon.splice(index, 1);
    }

    // Indices used to act as a read head for short and long tasks
    // to try to prevent players from having the exact same tasks
    const shortIndex = { val: 0 };
    const longIndex = { val: 0 };

    for (let pid = 0; pid < this.lobby.players.length; pid++) {
      // Clear the used task array
      used.clear();

      // Remove every non-common task (effectively reusing the same array)
      tasks.splice(numCommon, tasks.length - numCommon);

      // Add long tasks
      this.addTasksFromList(longIndex, numLong, tasks, used, allLong);

      // Add short tasks
      this.addTasksFromList(shortIndex, numShort, tasks, used, allShort);

      const player = this.lobby.players.find(pl => pl.id == pid);

      if (player) {
        if (!this.lobby.gameData) {
          throw new Error("Attempted to set tasks without a GameData instance");
        }

        this.lobby.gameData.gameData.setTasks(player.id, tasks.map(task => task.id), this.lobby.connections);
      }
    }
  }

  endGame(reason: GameOverReason): void {
    this.lobby.gameState = GameState.NotStarted;
    this.deconHandlers = [];
    this.readyPlayerList = [];
    this.lobby.players = [];

    this.playersInScene.clear();

    for (let i = 0; i < this.lobby.connections.length; i++) {
      this.lobby.connections[i].limboState = LimboState.PreSpawn;
    }

    delete this.lobby.lobbyBehavior;
    delete this.lobby.shipStatus;
    delete this.lobby.gameData;
    delete this.doorHandler;
    delete this.sabotageHandler;
    delete this.systemsHandler;

    this.lobby.sendRootGamePacket(new EndGamePacket(this.lobby.code, reason, false));

    this.lobby.gameData = new EntityGameData(this.lobby);
    this.lobby.gameData.owner = GLOBAL_OWNER;
    this.lobby.gameData.innerNetObjects = [
      new InnerGameData(this.getNextNetId(), this.lobby.gameData, []),
      new InnerVoteBanSystem(this.getNextNetId(), this.lobby.gameData),
    ];
  }

  private getNextPlayerId(): number {
    const taken = this.lobby.players.map(player => player.id);

    // TODO: Change the max if necessary, but this is how the ID assignment should work
    for (let i = 0; i < 10; i++) {
      if (taken.indexOf(i) == -1) {
        return i;
      }
    }

    return -1;
  }

  private addTasksFromList(
    start: { val: number },
    count: number,
    tasks: LevelTask[],
    usedTaskTypes: Set<TaskType>,
    unusedTasks: LevelTask[],
  ): void {
    // A separate counter to prevent the following loop from running forever
    let sanityCheck = 0;

    for (let i = 0; i < count; i++) {
      if (sanityCheck++ >= 1000) {
        // Stop after 1000 tries
        break;
      }

      // If we are trying to get another task that
      // exceeds the number of available tasks
      if (start.val >= unusedTasks.length) {
        // Start back at the beginning...
        start.val = 0;

        // ...and reshuffle the available tasks
        shuffleArray(unusedTasks);

        // If the player already has every single task...
        // if (unusedTasks.every(task => usedTaskTypes.indexOf(task.type) != -1)) {
        if (unusedTasks.every(task => usedTaskTypes.has(task.type))) {
          // ...then clear the used task array so they can have duplicates
          usedTaskTypes.clear();
        }
      }

      // Get the task
      const task: LevelTask | undefined = start.val >= unusedTasks.length ? undefined : unusedTasks[start.val++];

      if (!task) {
        continue;
      }

      // If it is already assigned...
      if (usedTaskTypes.has(task.type)) {
        // ...then go back one
        i--;
      } else {
        // ...otherwise add it to the player's tasks
        usedTaskTypes.add(task.type);
        tasks.push(task);
      }
    }
  }

  private shouldEndGame(): boolean {
    if (!this.lobby.gameData) {
      throw new Error("shouldEndGame called without a GameData instance");
    }

    if (this.lobby.gameState == GameState.NotStarted) {
      return false;
    }

    const aliveImpostors: PlayerData[] = [];
    const aliveCrewmates: PlayerData[] = [];

    for (let i = 0; i < this.lobby.gameData.gameData.players.length; i++) {
      const playerData = this.lobby.gameData.gameData.players[i];

      if (playerData.isDead || playerData.isDisconnected) {
        continue;
      }

      if (playerData.isImpostor) {
        aliveImpostors.push(playerData);
      } else {
        aliveCrewmates.push(playerData);
      }
    }

    return (aliveImpostors.length >= aliveCrewmates.length) || aliveImpostors.length == 0;
  }

  private isNameTaken(name: string): boolean {
    if (!this.lobby.gameData) {
      throw new Error("isNameTaken called without a GameData instance");
    }

    return !!this.lobby.gameData.gameData.players.find(player => player.name == name);
  }

  private getTakenColors(): PlayerColor[] {
    if (!this.lobby.gameData) {
      throw new Error("getTakenColors called without a GameData instance");
    }

    return this.lobby.gameData.gameData.players.map(player => player.color);
  }

  private confirmPlayerData(connection: Connection, player: Player): void {
    if (!this.lobby.gameData) {
      throw new Error("confirmPlayerData called without a GameData instance");
    }

    if (!this.lobby.gameData.gameData.players.some(p => p.id == player.gameObject.playerControl.playerId)) {
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

      this.lobby.gameData.gameData.updateGameData([playerData], this.lobby.connections);
    }
  }
}
