import { PlayerVotekickAddedEvent, PlayerVotekickRemovedEvent } from "../../../api/events/player";
import { InnerNetObjectType, RpcPacketType } from "../../../types/enums";
import { DataPacket, SpawnPacketObject } from "../../packets/gameData";
import { AddVotePacket, BaseRpcPacket } from "../../packets/rpc";
import { MessageWriter } from "../../../util/hazelMessage";
import { PlayerInstance } from "../../../api/player";
import { GameDataPacket } from "../../packets/root";
import { BaseInnerNetObject } from "../baseEntity";
import { DisconnectReason } from "../../../types";
import { Connection } from "../../connection";
import { Player } from "../../../player";
import { Lobby } from "../../../lobby";
import { EntityGameData } from ".";

export class InnerVoteBanSystem extends BaseInnerNetObject {
  constructor(
    protected readonly parent: EntityGameData,
    protected votes: Map<number, number[]> = new Map(),
    netId: number = parent.getLobby().getHostInstance().getNextNetId(),
  ) {
    super(InnerNetObjectType.VoteBanSystem, parent, netId);
  }

  getVotes(): Map<number, number[]> {
    return this.votes;
  }

  setVotes(votes: Map<number, number[]>): this {
    this.votes = votes;

    return this;
  }

  clearVotes(): this {
    this.votes.clear();

    return this;
  }

  getVotesForPlayer(playerId: number): number[] | undefined {
    return this.votes.get(playerId);
  }

  setVotesForPlayer(playerId: number, votes: number[]): this {
    this.votes.set(playerId, votes);

    return this;
  }

  removeVotesForPlayer(playerId: number): this {
    this.votes.delete(playerId);

    return this;
  }

  async addVote(voter: PlayerInstance, target: PlayerInstance, sendTo?: Connection[]): Promise<void> {
    const voterClientId = voter.getConnection()?.getId();
    const targetClientId = target.getConnection()?.getId();

    if (voterClientId === undefined || targetClientId === undefined) {
      return;
    }

    const event = new PlayerVotekickAddedEvent(voter, target);

    await this.parent.getLobby().getServer().emit("player.votekick.added", event);

    if (event.isCancelled()) {
      return;
    }

    const votes = this.votes.get(targetClientId) ?? [0, 0, 0];
    let shouldKick = false;

    for (let i = 0; i < 3; i++) {
      if (votes[i] == 0) {
        votes[i] = voterClientId;

        if (i == 2) {
          shouldKick = true;
        }
        break;
      }
    }

    if (shouldKick) {
      const player = this.parent.getLobby().findPlayerByClientId(targetClientId);

      if (player !== undefined) {
        await player.kick(DisconnectReason.kicked());
        await (this.parent.getLobby() as Lobby).sendRootGamePacket(new GameDataPacket([this.serializeData()], this.parent.getLobby().getCode()), sendTo);
      }
    } else {
      this.votes.set(targetClientId, votes);

      await this.sendRpcPacket(new AddVotePacket(voterClientId, targetClientId), sendTo);
    }
  }

  async clearVote(voter: Player, target: Player, sendTo?: Connection[]): Promise<void> {
    const event = new PlayerVotekickRemovedEvent(voter, target);

    await this.parent.getLobby().getServer().emit("player.votekick.removed", event);

    if (event.isCancelled()) {
      return;
    }

    await this.removeVote(voter.getEntity().getOwnerId(), target.getEntity().getOwnerId(), sendTo);
  }

  async clearVotesForPlayer(player: Player, sendTo?: Connection[]): Promise<void> {
    const votes = this.votes.get(player.getEntity().getOwnerId()) ?? [];

    for (let i = 0; votes.length; i++) {
      if (votes[i] == 0) {
        continue;
      }

      const voter = this.parent.getLobby().findPlayerByClientId(votes[i]);

      if (voter !== undefined) {
        await this.clearVote(voter as Player, player, sendTo);
      } else {
        await this.removeVote(votes[i], player.getEntity().getOwnerId(), sendTo);
      }
    }
  }

  async clearVotesFromPlayer(player: Player, sendTo?: Connection[]): Promise<void> {
    const voterClientId = player.getEntity().getOwnerId();
    const votes = [...this.votes.entries()]
      .filter(entry => entry[0] != voterClientId && entry[1].includes(voterClientId))
      .map(entry => entry[0]);

    for (let i = 0; i < votes.length; i++) {
      const target = this.parent.getLobby().findPlayerByClientId(votes[i]);

      if (target !== undefined) {
        await this.clearVote(player, target as Player, sendTo);
      } else {
        await this.removeVote(voterClientId, votes[i], sendTo);
      }
    }
  }

  handleRpc(connection: Connection, type: RpcPacketType, packet: BaseRpcPacket, sendTo: Connection[]): void {
    switch (type) {
      case RpcPacketType.AddVote: {
        const data = packet as AddVotePacket;

        this.addVote(
          this.parent.getLobby().findSafePlayerByClientId(data.votingClientId),
          this.parent.getLobby().findSafePlayerByClientId(data.targetClientId),
          sendTo,
        );
        break;
      }
      default:
        break;
    }
  }

  getParent(): EntityGameData {
    return this.parent;
  }

  serializeData(): DataPacket {
    const writer = new MessageWriter();

    writer.writeList(this.votes.entries(), (sub, item) => {
      sub.writeUInt32(item[0]);

      for (let i = 0; i < item[1].length; i++) {
        sub.writePackedUInt32(item[1][i]);
      }
    }, false);

    return new DataPacket(this.netId, writer);
  }

  serializeSpawn(): SpawnPacketObject {
    return new SpawnPacketObject(
      this.netId,
      new MessageWriter().writeBytes(this.serializeData().data),
    );
  }

  clone(): InnerVoteBanSystem {
    return new InnerVoteBanSystem(this.parent, new Map(this.votes), this.netId);
  }

  protected async removeVote(voterClientId: number, targetClientId: number, sendTo?: Connection[]): Promise<void> {
    const votes = this.votes.get(targetClientId) ?? [0, 0, 0];
    const index = votes.indexOf(voterClientId);

    if (index > -1) {
      votes.splice(index, 1);
      this.votes.set(targetClientId, votes);
      await (this.parent.getLobby() as Lobby).sendRootGamePacket(new GameDataPacket([this.serializeData()], this.parent.getLobby().getCode()), sendTo);
    }
  }
}
