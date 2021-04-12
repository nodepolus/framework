import { LobbyCountdownStartedEvent, LobbyCountdownStoppedEvent } from "../api/events/lobby";
import { EndGamePacket, GameDataPacket, StartGamePacket } from "../protocol/packets/root";
import { DisconnectReason, LevelTask, Vector2, VoteResult, VoteState } from "../types";
import { InternalSystemType } from "../protocol/entities/shipStatus/baseShipStatus";
import { EntityPlayer, InnerPlayerControl } from "../protocol/entities/player";
import { EntityAirshipStatus } from "../protocol/entities/shipStatus/airship";
import { EntityDleksShipStatus } from "../protocol/entities/shipStatus/dleks";
import { EntityPolusShipStatus } from "../protocol/entities/shipStatus/polus";
import { EntitySkeldShipStatus } from "../protocol/entities/shipStatus/skeld";
import { EntityMiraShipStatus } from "../protocol/entities/shipStatus/mira";
import { EntityLobbyBehaviour } from "../protocol/entities/lobbyBehaviour";
import { EntityMeetingHud } from "../protocol/entities/meetingHud";
import { shuffleArrayClone, shuffleArray } from "../util/shuffle";
import { PlayerData } from "../protocol/entities/gameData/types";
import { EntityGameData } from "../protocol/entities/gameData";
import { RpcPacket } from "../protocol/packets/gameData";
import { Connection } from "../protocol/connection";
import { SpawnPositions, Tasks } from "../static";
import { PlayerInstance } from "../api/player";
import { HostInstance } from "../api/host";
import { Game } from "../api/game";
import { Player } from "../player";
import { Lobby } from "../lobby";
import {
  AutoDoorsSystem,
  DeconSystem,
  DeconTwoSystem,
  DoorsSystem,
} from "../protocol/entities/shipStatus/systems";
import {
  ClearVotePacket,
  ClosePacket,
  SendChatNotePacket,
  SetInfectedPacket,
  SetStartCounterPacket,
  StartMeetingPacket,
  VotingCompletePacket,
} from "../protocol/packets/rpc";
import {
  MeetingClosedEvent,
  MeetingConcludedEvent,
  MeetingEndedEvent,
  MeetingStartedEvent,
  MeetingVoteAddedEvent,
} from "../api/events/meeting";
import {
  PlayerExiledEvent,
  PlayerRoleUpdatedEvent,
  PlayerSpawnedEvent,
  PlayerTaskAddedEvent,
} from "../api/events/player";
import {
  GameEndedEvent,
  GameStartedEvent,
  GameStartingEvent,
} from "../api/events/game";
import {
  AutoDoorsHandler,
  DecontaminationHandler,
  DoorsHandler,
  SabotageSystemHandler,
  SystemsHandler,
} from "./systemHandlers";
import {
  ChatNoteType,
  FakeClientId,
  GameOverReason,
  GameState,
  Level,
  LimboState,
  PlayerColor,
  PlayerRole,
  Scene,
  SpawnFlag,
  SystemType,
  TaskLength,
  TaskType,
  TeleportReason,
} from "../types/enums";

export class Host implements HostInstance {
  protected readonly id: number = FakeClientId.ServerAsHost;
  protected readonly playersInScene: Map<number, string> = new Map();

  protected readyPlayerList: number[] = [];
  protected netIdIndex = 1;
  protected counterSequenceId = 0;
  protected secondsUntilStart = -1;
  protected countdownInterval?: NodeJS.Timeout;
  protected meetingHudTimeout?: NodeJS.Timeout;
  protected systemsHandler?: SystemsHandler;
  protected sabotageHandler?: SabotageSystemHandler;
  protected doorHandler?: DoorsHandler | AutoDoorsHandler;
  protected decontaminationHandlers: DecontaminationHandler[] = [];

  /**
   * @param lobby - The lobby being controlled by the host
   */
  constructor(
    protected readonly lobby: Lobby,
  ) {}

  getLobby(): Lobby {
    return this.lobby;
  }

  getId(): number {
    return this.id;
  }

  getNextNetId(): number {
    return this.netIdIndex++;
  }

  getNextPlayerId(): number {
    const taken = this.lobby.getPlayers().map(player => player.getId());

    for (let i = 0; i < (this.lobby.getPlayers().length >= 10 ? 128 : 10); i++) {
      if (taken.indexOf(i) == -1) {
        return i;
      }
    }

    return -1;
  }

  clearTimers(): void {
    this.doorHandler?.clearTimers();
    this.decontaminationHandlers.forEach(handler => handler.clearTimer());
    this.sabotageHandler?.clearTimer();
    this.systemsHandler?.clearSabotageTimer();

    if (this.countdownInterval !== undefined) {
      clearInterval(this.countdownInterval);
      delete this.countdownInterval;
    }

    if (this.meetingHudTimeout !== undefined) {
      clearTimeout(this.meetingHudTimeout);
      delete this.meetingHudTimeout;
    }
  }

  async startCountdown(count: number, starter?: PlayerInstance): Promise<void> {
    const event = new LobbyCountdownStartedEvent(this.lobby, count, starter);

    await this.lobby.getServer().emit("lobby.countdown.started", event);

    if (event.isCancelled()) {
      const connection = starter?.getConnection();

      if (connection !== undefined) {
        this.lobby.getPlayers()[0].getEntity().getPlayerControl().sendRpcPacket(
          new SetStartCounterPacket(this.counterSequenceId += 5, -1),
          [connection],
        );
      }

      return;
    }

    this.secondsUntilStart = event.getSecondsUntilStart();

    const countdownFunction = (): void => {
      const time = this.secondsUntilStart--;

      if (this.lobby.getPlayers().length > 0) {
        this.lobby.getPlayers()[0].getEntity().getPlayerControl().sendRpcPacket(
          new SetStartCounterPacket(this.counterSequenceId += 5, time),
          this.lobby.getConnections(),
        );
      }

      if (time <= 0) {
        if (this.countdownInterval !== undefined) {
          clearInterval(this.countdownInterval);
          delete this.countdownInterval;
        }

        this.startGame();
      }
    };

    this.lobby.disableActingHosts(true);
    countdownFunction();

    this.countdownInterval = setInterval(countdownFunction, 1000);
  }

  async stopCountdown(): Promise<void> {
    const event = new LobbyCountdownStoppedEvent(this.lobby, this.secondsUntilStart);

    await this.lobby.getServer().emit("lobby.countdown.stopped", event);

    if (event.isCancelled()) {
      return;
    }

    if (this.countdownInterval !== undefined) {
      clearInterval(this.countdownInterval);
      delete this.countdownInterval;
    }

    this.secondsUntilStart = -1;

    if (this.lobby.getPlayers().length > 0) {
      this.lobby.getPlayers()[0].getEntity().getPlayerControl().sendRpcPacket(
        new SetStartCounterPacket(this.counterSequenceId += 5, -1),
        this.lobby.getConnections(),
      );
    }
  }

  async startGame(): Promise<void> {
    this.lobby.setGame(new Game(this.lobby));

    const event = new GameStartingEvent(this.lobby.getSafeGame());

    await this.lobby.getServer().emit("game.starting", event);

    if (event.isCancelled()) {
      this.lobby.setGame();

      return;
    }

    this.lobby.cancelStartTimer();
    this.lobby.disableActingHosts(true);
    this.lobby.sendRootGamePacket(new StartGamePacket(this.lobby.getCode()));
  }

  async setInfected(infectedCount: number): Promise<void> {
    const players = this.lobby.getPlayers();

    infectedCount = Math.min(infectedCount, Math.max(0, Math.floor(players.length / 2) - 1));

    let impostors = shuffleArrayClone(players)
      .slice(0, infectedCount)
      .map(player => player);
    const selectedIds = impostors.map(player => player.getId());
    const promises = (await Promise.all(players.map(async player => {
      const event = new PlayerRoleUpdatedEvent(player, selectedIds.includes(player.getId()) ? PlayerRole.Impostor : PlayerRole.Crewmate);

      await this.lobby.getServer().emit("player.role.updated", event);

      return event;
    })));

    for (let i = 0; i < promises.length; i++) {
      const event = promises[i];

      if (event.isCancelled() || event.getNewRole() == PlayerRole.Crewmate) {
        const index = impostors.findIndex(impostor => impostor.getId() == event.getPlayer().getId());

        if (index > -1) {
          impostors.splice(index, 1);
        }
      } else if (event.getNewRole() == PlayerRole.Impostor) {
        if (impostors.findIndex(impostor => impostor.getId() == event.getPlayer().getId()) == -1) {
          impostors.push(event.getPlayer() as Player);
        }
      }
    }

    const event = new GameStartedEvent(this.lobby.getSafeGame(), impostors);

    await this.lobby.getServer().emit("game.started", event);

    impostors = event.getImpostors() as Player[];

    for (let i = 0; i < impostors.length; i++) {
      impostors[i].setRole(PlayerRole.Impostor);
    }

    this.lobby.getPlayers()[0].getEntity().getPlayerControl().sendRpcPacket(
      new SetInfectedPacket(impostors.map(player => player.getId())),
      this.lobby.getConnections(),
    );
  }

  setTasks(): void {
    /**
     * This implementation is ported directly from Among Us to be as close to
     * the original as possible.
     */
    const options = this.lobby.getOptions();
    const level = options.getLevels()[0];
    const numCommon = options.getCommonTaskCount();
    const numLong = options.getLongTaskCount();
    // Minimum of 1 short task
    const numShort = numCommon + numLong + options.getShortTaskCount() > 0 ? options.getShortTaskCount() : 1;
    const allTasks = Tasks.forLevel(level);
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

    for (let pid = 0; pid < this.lobby.getPlayers().length; pid++) {
      // Clear the used task array
      used.clear();

      // Remove every non-common task (effectively reusing the same array)
      tasks.splice(numCommon, tasks.length - numCommon);

      // Add long tasks
      this.addTasksFromList(longIndex, numLong, tasks, used, allLong);

      // Add short tasks
      this.addTasksFromList(shortIndex, numShort, tasks, used, allShort);

      const player = this.lobby.getPlayers().find(pl => pl.getId() == pid);

      if (player !== undefined) {
        this.setPlayerTasks(player, tasks);
      }
    }
  }

  async setPlayerTasks(player: PlayerInstance, tasks: LevelTask[]): Promise<void> {
    const event = new PlayerTaskAddedEvent(player, new Set(tasks));

    await this.lobby.getServer().emit("player.task.added", event);

    if (event.isCancelled()) {
      return;
    }

    this.updatePlayerTasks(player, [...event.getTasks()]);
  }

  async endMeeting(): Promise<void> {
    const meetingHud = this.lobby.getSafeMeetingHud();
    const oldMeetingHud = meetingHud.getMeetingHud().clone();
    const voteResults: Map<number, VoteResult> = new Map();
    const playerInstanceCache: Map<number, PlayerInstance> = new Map();
    const fetchPlayerById = (playerId: number): PlayerInstance | undefined => {
      if (playerId == -1) {
        return;
      }

      if (playerInstanceCache.has(playerId)) {
        return playerInstanceCache.get(playerId);
      }

      const player = this.lobby.findPlayerByPlayerId(playerId);

      if (player === undefined) {
        return;
      }

      playerInstanceCache.set(playerId, player);

      return player;
    };

    const players = this.lobby.getPlayers();

    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const state = meetingHud!.getMeetingHud().getPlayerState(player.getId());

      if (state === undefined) {
        continue;
      }

      if (state.isDead()) {
        continue;
      }

      if (!voteResults.has(player.getId())) {
        voteResults.set(player.getId(), new VoteResult(player));
      }

      const vote = voteResults.get(player.getId())!;

      if (state.didVote()) {
        const votedFor = fetchPlayerById(state.getVotedFor());

        if (votedFor === undefined) {
          if (state.getVotedFor() == -1) {
            vote.setSkipping();
          } else {
            voteResults.delete(player.getId());
          }
        } else {
          vote.setVotedFor(votedFor);
        }
      }
    }

    const concludedEvent = new MeetingConcludedEvent(this.lobby.getSafeGame(), [...voteResults.values()]);

    await this.lobby.getServer().emit("meeting.concluded", concludedEvent);

    const isTied = concludedEvent.isTied();
    let exiledPlayer = concludedEvent.getExiledPlayer();

    if (concludedEvent.isCancelled()) {
      return;
    }

    let exiledPlayerData: PlayerData | undefined;

    if (!isTied && exiledPlayer !== undefined) {
      const exiledEvent = new PlayerExiledEvent(
        exiledPlayer,
        [...concludedEvent.getVotes()]
          .filter(vote => vote.getVotedFor()?.getId() == exiledPlayer?.getId())
          .map(vote => vote.getPlayer()),
      );

      await this.lobby.getServer().emit("player.died", exiledEvent);
      await this.lobby.getServer().emit("player.exiled", exiledEvent);

      if (!exiledEvent.isCancelled()) {
        exiledPlayer = exiledEvent.getPlayer();
        exiledPlayerData = exiledPlayer.getGameDataEntry();

        exiledPlayerData.setDead(true);
      }
    }

    const states = meetingHud.getMeetingHud().getPlayerStates();
    const length = Math.max(...meetingHud.getMeetingHud().getPlayerStates().keys()) + 1;
    const fullStates = new Array<VoteState>(length);

    for (let i = 0; i < length; i++) {
      fullStates[i] = states.get(i) ?? new VoteState(false, false, false, -1);
    }

    meetingHud.getMeetingHud().sendRpcPacket(new VotingCompletePacket(
      fullStates,
      isTied ? 0xff : (exiledPlayer?.getId() ?? 0xff),
      isTied,
    ), this.lobby.getConnections());

    this.lobby.sendRootGamePacket(new GameDataPacket([
      meetingHud.getMeetingHud().serializeData(oldMeetingHud),
    ], this.lobby.getCode()));

    setTimeout(async () => {
      const closedEvent = new MeetingClosedEvent(
        this.lobby.getSafeGame(),
        concludedEvent.getVotes(),
        isTied,
        exiledPlayer,
      );

      await this.lobby.getServer().emit("meeting.closed", closedEvent);

      if (closedEvent.isCancelled()) {
        return;
      }

      meetingHud.getMeetingHud().sendRpcPacket(new ClosePacket(), this.lobby.getConnections());

      this.lobby.deleteMeetingHud();

      setTimeout(() => {
        this.lobby.getServer().emit("meeting.ended", new MeetingEndedEvent(
          this.lobby.getSafeGame(),
          concludedEvent.getVotes(),
          isTied,
          exiledPlayer,
        ));

        if (this.shouldEndGame()) {
          if (exiledPlayerData!.isImpostor()) {
            this.endGame(GameOverReason.CrewmatesByVote);
          } else {
            this.endGame(GameOverReason.ImpostorsByVote);
          }
        }
      // This timing of 8.5 seconds is based on in-game observations and may be
      // slightly inaccurate due to network latency and fluctuating framerates.
      // TODO: Too long of a delay?
      }, 8500);
    }, 5000);
  }

  checkForTaskWin(): void {
    const gameData = this.lobby.getSafeGameData();
    const crewmates = [...gameData.getGameData().getPlayers().values()].filter(playerData => !playerData.isImpostor());

    if (crewmates.every(crewmate => crewmate.isDoneWithTasks())) {
      this.endGame(GameOverReason.CrewmatesByTask);
    }
  }

  async endGame(reason: GameOverReason): Promise<void> {
    const oldState = this.lobby.getGameState();
    const event = new GameEndedEvent(this.lobby.getSafeGame(), reason);

    this.lobby.setGameState(GameState.NotStarted);

    await this.lobby.getServer().emit("game.ended", event);

    if (event.isCancelled()) {
      this.lobby.setGameState(oldState);

      return;
    }

    const connections = this.lobby.getConnections();

    for (let i = 0; i < connections.length; i++) {
      connections[i].setCurrentScene(Scene.EndGame);
    }

    this.decontaminationHandlers = [];
    this.readyPlayerList = [];

    this.lobby.clearPlayers();
    this.playersInScene.clear();

    for (let i = 0; i < this.lobby.getConnections().length; i++) {
      this.lobby.getConnections()[i].setLimboState(LimboState.PreSpawn);
    }

    if (this.meetingHudTimeout !== undefined) {
      clearTimeout(this.meetingHudTimeout);
      delete this.meetingHudTimeout;
    }

    this.lobby.deleteLobbyBehaviour();
    this.lobby.deleteShipStatus();
    this.lobby.deleteMeetingHud();
    delete this.doorHandler;
    delete this.sabotageHandler;
    delete this.systemsHandler;

    this.lobby.setGameData(new EntityGameData(this.lobby));
    this.lobby.sendRootGamePacket(new EndGamePacket(this.lobby.getCode(), event.getReason(), false));
  }

  ensurePlayerDataExists(player: PlayerInstance): void {
    const gameData = this.lobby.getSafeGameData();

    if (![...gameData.getGameData().getPlayers().values()].some(p => p.getId() == player.getId())) {
      const playerData = new PlayerData(
        player.getId(),
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

      gameData.getGameData().updateGameData([playerData], this.lobby.getConnections());
    }
  }

  getSystemsHandler(): SystemsHandler | undefined {
    return this.systemsHandler;
  }

  getSabotageHandler(): SabotageSystemHandler | undefined {
    return this.sabotageHandler;
  }

  getDoorHandler(): DoorsHandler | AutoDoorsHandler | undefined {
    return this.doorHandler;
  }

  getDecontaminationHandlers(): DecontaminationHandler[] {
    return this.decontaminationHandlers;
  }

  handleImpostorDeath(): void {
    if (this.shouldEndGame()) {
      this.endGame(GameOverReason.CrewmatesByVote);
    }
  }

  handleDisconnect(connection: Connection, _reason?: DisconnectReason): void {
    const gameState = this.lobby.getGameState();
    const gameData = this.lobby.getGameData();

    if (gameState == GameState.NotStarted) {
      this.stopCountdown();
      this.lobby.enableActingHosts(true);
    }

    if (gameData === undefined) {
      if (gameState == GameState.NotStarted || gameState == GameState.Started) {
        throw new Error("Received Disconnect without a GameData instance");
      }

      return;
    }

    const player = this.lobby.findPlayerByConnection(connection);

    if (player === undefined) {
      this.lobby.getLogger().warn("Received Disconnect from connection without a player");

      return;
    }

    const playerData = player.getGameDataEntry();

    if (gameState == GameState.Started) {
      playerData.setDisconnected(true);
    } else {
      gameData.getGameData().removePlayer(player.getId());
    }

    gameData.getGameData().updateAllGameData(this.lobby.getConnections());
    gameData.getVoteBanSystem().removeVotesForPlayer(connection.getId());

    if (this.shouldEndGame()) {
      if (playerData.isImpostor()) {
        this.endGame(GameOverReason.ImpostorDisconnect);
      } else {
        this.endGame(GameOverReason.CrewmateDisconnect);
      }
    }
  }

  async handleReady(connection: Connection): Promise<void> {
    this.readyPlayerList.push(connection.getId());

    /**
     * TODO:
     * Add disconnection logic to timeout players who take too long to be ready.
     * This **SHOULD NOT** be allowed because literally anybody who can read
     * could browse the source or check sus.wiki to figure this out and lock up
     * an entire server if they really wanted to.
     */

    const connections = this.lobby.getConnections();

    if (this.readyPlayerList.length != connections.length) {
      return;
    }

    const lobbyBehaviour = this.lobby.getLobbyBehaviour();

    if (lobbyBehaviour !== undefined) {
      this.lobby.despawn(lobbyBehaviour.getLobbyBehaviour());
      this.lobby.deleteLobbyBehaviour();
    }

    switch (this.lobby.getLevel()) {
      case Level.TheSkeld:
        this.lobby.setShipStatus(new EntitySkeldShipStatus(this.lobby));
        break;
      case Level.AprilSkeld:
        this.lobby.setShipStatus(new EntityDleksShipStatus(this.lobby));
        break;
      case Level.MiraHq:
        this.lobby.setShipStatus(new EntityMiraShipStatus(this.lobby));
        break;
      case Level.Polus:
        this.lobby.setShipStatus(new EntityPolusShipStatus(this.lobby));
        break;
      case Level.Airship: {
        const airshipStatus = new EntityAirshipStatus(this.lobby);
        const autoDoorsSystem = airshipStatus.getShipStatus().getSystemFromType(SystemType.Doors) as AutoDoorsSystem;
        const doorsSystem = airshipStatus.getShipStatus().getSystemFromType(SystemType.Decontamination2) as DoorsSystem;

        for (let i = 15; i <= 18; i++) {
          autoDoorsSystem.setDoorState(i, false);
          doorsSystem.setDoorState(i, false);
        }

        this.lobby.setShipStatus(airshipStatus);
        break;
      }
    }

    this.systemsHandler = new SystemsHandler(this);
    this.sabotageHandler = new SabotageSystemHandler(this);

    switch (this.lobby.getLevel()) {
      case Level.TheSkeld:
        this.decontaminationHandlers = [];
        this.doorHandler = new AutoDoorsHandler(this, this.lobby.getSafeShipStatus().getShipStatus());
        break;
      case Level.AprilSkeld:
        this.decontaminationHandlers = [];
        this.doorHandler = new AutoDoorsHandler(this, this.lobby.getSafeShipStatus().getShipStatus());
        break;
      case Level.MiraHq:
        this.decontaminationHandlers = [
          new DecontaminationHandler(this, this.lobby.getSafeShipStatus().getShipStatus().getSystems()[InternalSystemType.Decon] as DeconSystem),
        ];
        break;
      case Level.Polus:
        this.decontaminationHandlers = [
          new DecontaminationHandler(this, this.lobby.getSafeShipStatus().getShipStatus().getSystems()[InternalSystemType.Decon] as DeconSystem),
          new DecontaminationHandler(this, this.lobby.getSafeShipStatus().getShipStatus().getSystems()[InternalSystemType.Decon2] as DeconTwoSystem),
        ];
        this.doorHandler = new DoorsHandler(this, this.lobby.getShipStatus()!.getShipStatus());
        break;
      case Level.Airship:
        this.decontaminationHandlers = [];
        this.doorHandler = new DoorsHandler(this, this.lobby.getSafeShipStatus().getShipStatus());
        break;
    }

    const gameData = this.lobby.getSafeGameData();

    this.lobby.sendRootGamePacket(new GameDataPacket([this.lobby.getSafeShipStatus().serializeSpawn()], this.lobby.getCode()));
    this.lobby.setGameState(GameState.Started);
    await this.setInfected(this.lobby.getOptions().getImpostorCount());
    this.setTasks();
    gameData.getGameData().updateAllGameData(connections);

    const players = this.lobby.getPlayers();

    for (let i = 0; i < players.length; i++) {
      players[i].setPosition(
        SpawnPositions.forPlayerOnLevel(this.lobby.getLevel(), players[i].getId(), players.length, true),
        TeleportReason.GameStart,
      );
    }
  }

  async handleSceneChange(connection: Connection, sceneName: string): Promise<void> {
    connection.setCurrentScene(Scene[sceneName]);

    if (sceneName !== Scene.OnlineGame) {
      return;
    }

    if (this.playersInScene.has(connection.getId())) {
      throw new Error("Sender has already changed scene");
    }

    const newPlayerId = this.getNextPlayerId();

    if (newPlayerId == -1) {
      connection.sendLateRejection(DisconnectReason.gameFull());

      return;
    }

    this.stopCountdown();
    this.playersInScene.set(connection.getId(), sceneName);

    let lobbyBehaviour = this.lobby.getLobbyBehaviour();
    const shipStatus = this.lobby.getShipStatus();

    if (lobbyBehaviour === undefined && shipStatus === undefined) {
      lobbyBehaviour = new EntityLobbyBehaviour(this.lobby);

      this.lobby.setLobbyBehaviour(lobbyBehaviour);
    }

    if (lobbyBehaviour !== undefined) {
      connection.writeReliable(new GameDataPacket([lobbyBehaviour.serializeSpawn()], this.lobby.getCode()));
    } else if (shipStatus !== undefined) {
      connection.writeReliable(new GameDataPacket([shipStatus.serializeSpawn()], this.lobby.getCode()));
    } else {
      throw new Error("Received SceneChange without a LobbyBehaviour or ShipStatus instance");
    }

    let gameData = this.lobby.getGameData();

    if (gameData === undefined) {
      gameData = new EntityGameData(this.lobby);

      this.lobby.setGameData(gameData);
    }

    connection.writeReliable(new GameDataPacket([gameData.serializeSpawn()], this.lobby.getCode()));

    const event = new PlayerSpawnedEvent(connection, this.lobby, newPlayerId, true, SpawnPositions.forPlayerInDropship(newPlayerId));

    await this.lobby.getServer().emit("player.spawned", event);

    if (!event.isCancelled()) {
      const entity = new EntityPlayer(
        this.lobby,
        connection.getId(),
        event.getPosition(),
        Vector2.zero(),
        newPlayerId,
        true,
        SpawnFlag.IsClientCharacter,
      );

      entity.getPlayerControl().setNewPlayer(event.isNew());

      const player = new Player(this.lobby, entity, connection);

      this.lobby.addPlayer(player);
      await this.lobby.sendRootGamePacket(new GameDataPacket([player.getEntity().serializeSpawn()], this.lobby.getCode()));
      this.ensurePlayerDataExists(player);
      player.getEntity().getPlayerControl().setNewPlayer(false);
    }

    for (let i = 0; i < this.lobby.getPlayers().length; i++) {
      connection.writeReliable(new GameDataPacket([this.lobby.getPlayers()[i].getEntity().serializeSpawn()], this.lobby.getCode()));
    }

    (this.lobby.getPlayers()[0] as Player).getEntity().getPlayerControl().syncSettings(this.lobby.getOptions(), [connection]);
    connection.flush(true);
    gameData.getGameData().updateAllGameData(this.lobby.getConnections());
  }

  async handleReportDeadBody(sender: InnerPlayerControl, victimPlayerId?: number): Promise<void> {
    if (this.lobby.getMeetingHud() !== undefined) {
      this.getLobby().getLogger().warn("Received ReportDeadBody during a meeting");

      return;
    }

    const gameData = this.lobby.getSafeGameData();
    const owner = this.lobby.findSafeConnection(sender.getParent().getOwnerId());
    const player = this.lobby.findSafePlayerByConnection(owner);
    const event = new MeetingStartedEvent(
      this.lobby.getSafeGame(),
      player,
      victimPlayerId !== undefined ? this.lobby.findPlayerByPlayerId(victimPlayerId) : undefined,
    );

    await this.lobby.getServer().emit("meeting.started", event);

    if (event.isCancelled()) {
      // TODO: Try to remove "Waiting for host" text on emergency meeting button window
      return;
    }

    sender.sendRpcPacket(new StartMeetingPacket(event.getVictim()?.getId() ?? 0xff), this.lobby.getConnections());

    const meetingHud = new EntityMeetingHud(this.lobby);
    const playerData = gameData.getGameData().getPlayers();

    this.lobby.setMeetingHud(meetingHud);

    for (const [id, data] of playerData) {
      meetingHud!.getMeetingHud().setPlayerState(id, new VoteState(
        id == event.getCaller().getId(),
        false,
        data.isDead() || data.isDisconnected(),
        -1,
      ));
    }

    this.lobby.sendRootGamePacket(new GameDataPacket([
      meetingHud.serializeSpawn(),
    ], this.lobby.getCode()));

    const players = this.lobby.getPlayers();

    for (let i = 0; i < players.length; i++) {
      players[i].setPosition(
        SpawnPositions.forPlayerOnLevel(this.lobby.getLevel(), players[i].getId(), players.length, false),
        TeleportReason.MeetingStart,
      );
    }

    this.meetingHudTimeout = setTimeout(this.endMeeting.bind(this), (this.lobby.getOptions().getVotingTime() + this.lobby.getOptions().getDiscussionTime()) * 1000);
  }

  handleMurderPlayer(_sender: InnerPlayerControl, _victimPlayerControlNetId: number): void {
    if (this.shouldEndGame()) {
      this.endGame(GameOverReason.ImpostorsByKill);
    }
  }

  handleSetStartCounter(player: PlayerInstance, sequenceId: number, timeRemaining: number): void {
    if (timeRemaining == -1) {
      return;
    }

    const connection = player.getConnection();

    // TODO: Add an event for plugins to allow non-hosts to start games
    if (!(connection?.isActingHost() ?? false)) {
      if (connection !== undefined) {
        (player as Player).getEntity().getPlayerControl().sendRpcPacket(
          new SetStartCounterPacket(this.counterSequenceId += 5, -1),
          [connection],
        );
      }

      return;
    }

    if (this.counterSequenceId < sequenceId && this.countdownInterval !== undefined) {
      clearInterval(this.countdownInterval);
      delete this.countdownInterval;
    }

    if (timeRemaining == 5) {
      this.startCountdown(this.lobby.getStartTimerDuration(), player);
    }
  }

  async handleCastVote(votingPlayerId: number, suspectPlayerId: number): Promise<void> {
    const meetingHud = this.lobby.getSafeMeetingHud();
    const player = this.lobby.findSafePlayerByPlayerId(votingPlayerId);
    const event = new MeetingVoteAddedEvent(
      this.lobby.getSafeGame(),
      player,
      suspectPlayerId !== -1 ? this.lobby.findPlayerByPlayerId(suspectPlayerId) : undefined,
    );

    await this.lobby.getServer().emit("meeting.vote.added", event);

    if (event.isCancelled()) {
      const connection = player.getConnection();

      if (connection !== undefined) {
        meetingHud.getMeetingHud().sendRpcPacket(new ClearVotePacket(), [connection]);
      }

      return;
    }

    const oldMeetingHud = meetingHud.getMeetingHud().clone();
    const state = meetingHud.getMeetingHud().getPlayerState(event.getVoter().getId());
    const id = event.getSuspect()?.getId();

    if (state === undefined) {
      throw new Error(`Player ${votingPlayerId} does not have a VoteState instance on the MeetingHud instance`);
    }

    state.setVotedFor(id !== undefined ? id : -1).setVoted(true);

    this.lobby.sendRootGamePacket(new GameDataPacket([
      meetingHud.getMeetingHud().serializeData(oldMeetingHud),
      new RpcPacket(player.getEntity().getPlayerControl().getNetId(), new SendChatNotePacket(event.getVoter().getId(), ChatNoteType.DidVote)),
    ], this.lobby.getCode()));

    if (this.meetingHudTimeout !== undefined && [...meetingHud.getMeetingHud().getPlayerStates().values()].every(p => p.didVote() || p.isDead())) {
      this.endMeeting();
      clearTimeout(this.meetingHudTimeout);
      delete this.meetingHudTimeout;
    }
  }

  /**
   * Sets the give players task list.
   *
   * @internal
   * @param player - The player whose task list will be updates
   * @param tasks - The player's new tasks
   */
  updatePlayerTasks(player: PlayerInstance, tasks: LevelTask[]): this {
    this.lobby.getSafeGameData().getGameData().setTasks(player.getId(), tasks.map(task => task.id), this.lobby.getConnections());

    return this;
  }

  /**
   * Adds random tasks to the given list.
   *
   * @internal
   * @param start - The position in the source array to prevent an out-of-bounds array access
   * @param count - The number of tasks to add
   * @param tasks - The output array containing the random tasks
   * @param usedTaskTypes - The types of tasks that are already in the output array
   * @param unusedTasks - The source array of tasks
   */
  protected addTasksFromList(
    start: { val: number },
    count: number,
    tasks: LevelTask[],
    usedTaskTypes: Set<TaskType>,
    unusedTasks: LevelTask[],
  ): this {
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
        if (unusedTasks.every(task => usedTaskTypes.has(task.type))) {
          // ...then clear the used task array so they can have duplicates
          usedTaskTypes.clear();
        }
      }

      // Get the task
      const task: LevelTask | undefined = start.val >= unusedTasks.length ? undefined : unusedTasks[start.val++];

      if (task === undefined) {
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

    return this;
  }

  /**
   * Gets whether or not the game should end based on the number of Impostors
   * and Crewmates that are still alive.
   *
   * @internal
   * @returns `true` if `impostors.length >= crewmates.length`, `false` if not
   */
  protected shouldEndGame(): boolean {
    if (this.lobby.getGameState() == GameState.NotStarted) {
      return false;
    }

    const gameData = this.lobby.getSafeGameData();
    const aliveImpostors: PlayerData[] = [];
    const aliveCrewmates: PlayerData[] = [];
    const playerData = gameData.getGameData().getPlayers();

    for (const [, data] of playerData) {
      if (data.isDead() || data.isDisconnected()) {
        continue;
      }

      if (data.isImpostor()) {
        aliveImpostors.push(data);
      } else {
        aliveCrewmates.push(data);
      }
    }

    return (aliveImpostors.length >= aliveCrewmates.length) || aliveImpostors.length == 0;
  }
}
