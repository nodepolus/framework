import { ClearVotePacket, ClosePacket, VotingCompletePacket } from "../../packets/rpc";
import { MessageReader, MessageWriter } from "../../../util/hazelMessage";
import { SpawnInnerNetObject } from "../../packets/gameData/types";
import { shallowEqual } from "../../../util/functions";
import { InnerNetObjectType } from "../types/enums";
import { DataPacket } from "../../packets/gameData";
import { Connection } from "../../connection";
import { BaseInnerNetObject } from "../types";
import { EntityMeetingHud } from ".";
import { VoteState } from "./types";

export class InnerMeetingHud extends BaseInnerNetObject {
  public playerStates: VoteState[] = [];
  public ended = false;
  public isTie = false;
  public exiledPlayer = 0xff;

  constructor(
    netId: number,
    public parent: EntityMeetingHud,
  ) {
    super(InnerNetObjectType.MeetingHud, netId, parent);
  }

  close(sendTo: Connection[]): void {
    this.sendRPCPacketTo(sendTo, new ClosePacket());
  }

  votingComplete(voteStates: VoteState[], didVotePlayerOff: boolean, exiledPlayerId: number, isTie: boolean, sendTo: Connection[]): void {
    for (let i = 0; i < voteStates.length; i++) {
      this.playerStates[i] = voteStates[i];
    }

    this.ended = true;
    this.isTie = isTie;
    this.exiledPlayer = didVotePlayerOff ? exiledPlayerId : 0xff;

    this.sendRPCPacketTo(sendTo, new VotingCompletePacket(this.playerStates, this.exiledPlayer, this.isTie));
  }

  castVote(votingPlayerId: number, suspectPlayerId: number): void {
    this.parent.lobby.getHostInstance().handleCastVote(votingPlayerId, suspectPlayerId);
  }

  clearVote(player: Connection[]): void {
    this.sendRPCPacketTo(player, new ClearVotePacket());
  }

  getData(old: InnerMeetingHud): DataPacket {
    const writer = new MessageWriter();
    const dirtyBits = this.serializeStatesToDirtyBits(old.playerStates);

    writer.writePackedUInt32(dirtyBits);

    for (let i = 0; i < this.playerStates.length; i++) {
      const state = this.playerStates[i];

      if (shallowEqual(state, old.playerStates[i])) {
        continue;
      }

      state.serialize(writer);
    }

    return new DataPacket(this.netId, writer);
  }

  setData(packet: MessageReader | MessageWriter): void {
    const data = MessageReader.fromRawBytes(packet);
    const dirtyStates = this.deserializeDirtyBitsToStates(data.readPackedUInt32());

    for (let i = 0; i < dirtyStates.length; i++) {
      this.playerStates[dirtyStates[i]] = VoteState.deserialize(data);
    }
  }

  serializeSpawn(): SpawnInnerNetObject {
    const writer = new MessageWriter();

    for (let i = 0; i < this.playerStates.length; i++) {
      this.playerStates[i].serialize(writer);
    }

    return new SpawnInnerNetObject(this.netId, writer);
  }

  clone(): InnerMeetingHud {
    const clone = new InnerMeetingHud(this.netId, this.parent);

    clone.playerStates = this.playerStates.map(state => state.clone());

    return clone;
  }

  private serializeStatesToDirtyBits(states: VoteState[]): number {
    let n = 0;

    for (let i = 0; i < this.playerStates.length; i++) {
      if (!shallowEqual(states[i], this.playerStates[i])) {
        n |= 1 << i;
      }
    }

    return n;
  }

  private deserializeDirtyBitsToStates(dirtyBits: number): number[] {
    const voteStates: number[] = [];

    for (let i = 0; i < this.playerStates.length; i++) {
      if ((dirtyBits & (1 << i)) != 0) {
        voteStates.push(i);
      }
    }

    return voteStates;
  }
}
