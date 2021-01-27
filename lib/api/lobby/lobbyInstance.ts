import { BaseEntityShipStatus } from "../../protocol/entities/baseShipStatus/baseEntityShipStatus";
import { BaseInnerNetEntity, BaseInnerNetObject } from "../../protocol/entities/types";
import { EntityLobbyBehaviour } from "../../protocol/entities/lobbyBehaviour";
import { EntityMeetingHud } from "../../protocol/entities/meetingHud";
import { PlayerData } from "../../protocol/entities/gameData/types";
import { GameState, AlterGameTag, Level } from "../../types/enums";
import { EntityGameData } from "../../protocol/entities/gameData";
import { LobbyListing } from "../../protocol/packets/root/types";
import { EntityPlayer } from "../../protocol/entities/player";
import { BaseRPCPacket } from "../../protocol/packets/rpc";
import { GameOptionsData, Immutable } from "../../types";
import { Connection } from "../../protocol/connection";
import { LobbySettings } from "./lobbySettings";
import { PlayerInstance } from "../player";
import { HostInstance } from "../host";
import { Logger } from "../../logger";
import { Server } from "../../server";
import { Game } from "../game";

export interface LobbyInstance {
  getLogger(): Logger;

  getServer(): Server;

  getAddress(): string;

  getPort(): number;

  getCode(): string;

  getHostName(): string;

  isPublic(): boolean;

  isFull(): boolean;

  getLobbyListing(): LobbyListing;

  getGame(): Game | undefined;

  getCreationTime(): number;

  getAge(): number;

  hasMeta(key: string): boolean;

  getMeta(): Map<string, unknown>;

  getMeta(key: string): unknown;

  getMeta(key?: string): Map<string, unknown> | unknown;

  setMeta(key: string, value: unknown): void;

  deleteMeta(key: string): void;

  clearMeta(): void;

  getHostInstance(): HostInstance;

  getConnections(): Connection[];

  addConnection(connection: Connection): void;

  removeConnection(connection: Connection): void;

  getPlayers(): PlayerInstance[];

  addPlayer(player: PlayerInstance): void;

  findPlayerByClientId(clientId: number): PlayerInstance | undefined;

  findPlayerByPlayerId(playerId: number): PlayerInstance | undefined;

  findPlayerByNetId(netId: number): PlayerInstance | undefined;

  clearPlayers(): void;

  removePlayer(player: PlayerInstance): void;

  getGameData(): EntityGameData | undefined;

  setGameData(gameData: EntityGameData): void;

  deleteGameData(): void;

  getLobbyBehaviour(): EntityLobbyBehaviour | undefined;

  setLobbyBehaviour(lobbyBehaviour: EntityLobbyBehaviour): void;

  deleteLobbyBehaviour(): void;

  getShipStatus(): BaseEntityShipStatus | undefined;

  setShipStatus(shipStatus: BaseEntityShipStatus): void;

  deleteShipStatus(): void;

  getMeetingHud(): EntityMeetingHud | undefined;

  setMeetingHud(meetingHud: EntityMeetingHud): void;

  deleteMeetingHud(): void;

  getSettings(): LobbySettings;

  getOptions(): Immutable<GameOptionsData>;

  getLevel(): Level;

  getGameTags(): Map<AlterGameTag, number>;

  getGameTag(gameTag: AlterGameTag): number | undefined;

  setGameTag(gameTag: AlterGameTag, value: number): void;

  getGameState(): GameState;

  setGameState(gameState: GameState): void;

  sendRPCPacket(from: BaseInnerNetObject, packet: BaseRPCPacket, sendTo?: Connection[]): void;

  spawn(entity: BaseInnerNetEntity): void;

  spawnPlayer(player: EntityPlayer, playerData: PlayerData): PlayerInstance;

  despawn(innerNetObject: BaseInnerNetObject): void;

  getActingHosts(): Connection[];

  setActingHost(connection: Connection, sendImmediately: boolean): void;

  removeActingHost(connection: Connection, sendImmediately: boolean): void;
}
