import { InnerNetObjectType, RpcPacketType, VoteStateConstants } from "../../../types/enums";
import { BaseRpcPacket, CastVotePacket, ClearVotePacket } from "../../packets/rpc";
import { DataPacket, SpawnPacketObject } from "../../packets/gameData";
import { MeetingVoteRemovedEvent } from "../../../api/events/meeting";
import { notUndefined, shallowEqual } from "../../../util/functions";
import { MessageWriter } from "../../../util/hazelMessage";
import { PlayerInstance } from "../../../api/player";
import { GameDataPacket } from "../../packets/root";
import { BaseInnerNetObject } from "../baseEntity";
import { Connection } from "../../connection";
import { VoteState } from "../../../types";
import { EntityMeetingHud } from ".";

export class InnerMeetingHud extends BaseInnerNetObject {
  constructor(
    protected readonly parent: EntityMeetingHud,
    protected playerStates: Map<number, VoteState> = new Map(),
    netId: number = parent.getLobby().getHostInstance().getNextNetId(),
  ) {
    super(InnerNetObjectType.MeetingHud, parent, netId);
  }

  getPlayerStates(): Map<number, VoteState> {
    return this.playerStates;
  }

  setPlayerStates(playerStates: Map<number, VoteState>): this {
    this.playerStates = playerStates;

    return this;
  }

  clearPlayerStates(): this {
    this.playerStates.clear();

    return this;
  }

  getPlayerState(playerId: number): VoteState | undefined {
    return this.playerStates.get(playerId);
  }

  setPlayerState(playerId: number, voteState: VoteState): this {
    this.playerStates.set(playerId, voteState);

    return this;
  }

  removePlayerState(playerId: number): this {
    this.playerStates.delete(playerId);

    return this;
  }

  async castVote(votingPlayerId: number, suspectPlayerId: number, _sendTo?: Connection[]): Promise<void> {
    await this.parent.getLobby().getHostInstance().handleCastVote(votingPlayerId, suspectPlayerId);
  }

  async clearVote(players: PlayerInstance[]): Promise<void> {
    const promises = (await Promise.all(players.map(async player => {
      const event = new MeetingVoteRemovedEvent(this.parent.getLobby().getSafeGame(), player);

      await this.parent.getLobby().getServer().emit("meeting.vote.removed", event);

      return event;
    }))).filter(event => !event.isCancelled()).map(event => {
      const connection = event.getPlayer().getConnection();
      const state = this.playerStates.get(event.getPlayer().getId())!;

      state.setVotedFor(VoteStateConstants.HasNotVoted);

      return connection;
    }).filter(notUndefined);

    this.sendRpcPacket(new ClearVotePacket(), promises);
    await this.getLobby().sendRootGamePacket(new GameDataPacket([
      this.serializeData(this.clone()),
    ], this.getLobby().getCode()), promises);
  }

  handleRpc(connection: Connection, type: RpcPacketType, packet: BaseRpcPacket, sendTo: Connection[]): void {
    switch (type) {
      case RpcPacketType.CastVote: {
        const data = packet as CastVotePacket;

        this.castVote(data.votingPlayerId, data.suspectPlayerId, sendTo);
        break;
      }
      case RpcPacketType.ClearVote:
        this.parent.getLobby().getLogger().warn("Received ClearVote packet from connection %s in a server-as-host state", connection);
        break;
      case RpcPacketType.Close:
        this.parent.getLobby().getLogger().warn("Received Close packet from connection %s in a server-as-host state", connection);
        break;
      default:
        break;
    }
  }

  getParent(): EntityMeetingHud {
    return this.parent;
  }

  serializeData(old: InnerMeetingHud): DataPacket {
    const updatedStates = [...this.playerStates.entries()].filter(state => !shallowEqual(state[1], old.playerStates.get(state[0])))
    const writer = new MessageWriter().writePackedUInt32(updatedStates.length);

    for (const [id, state] of updatedStates) {
      if (!shallowEqual(state, old.playerStates.get(id))) {
        writer.startMessage(id);
        writer.writeObject(state);
        writer.endMessage();
      }
    }

    return new DataPacket(this.netId, writer);
  }

  serializeSpawn(): SpawnPacketObject {
    const writer = new MessageWriter();

    for (const [id, state] of this.playerStates.entries()) {
      writer.startMessage(id);
      writer.writeObject(state);
      writer.endMessage();
    }

    return new SpawnPacketObject(this.netId, writer);
  }

  clone(): InnerMeetingHud {
    return new InnerMeetingHud(this.parent, new Map(Array.from(this.playerStates, ([id, state]) => [id, state.clone()])), this.netId);
  }
}
