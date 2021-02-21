import { BaseInnerNetObject } from "../../../protocol/entities/types";
import { BaseRpcPacket } from "../../../protocol/packets/rpc";
import { Connection } from "../../../protocol/connection";
import { CancellableEvent } from "../types";

/**
 * Fired when an RPC packet defined in the base protocol has been sent to a
 * connection.
 */
export class ServerPacketOutRpcEvent extends CancellableEvent {
  private sender?: BaseInnerNetObject;

  /**
   * @param connection - The connection to which the packet was sent
   * @param netId - The ID of the InnerNetObject that sent the packet
   * @param packet - The RPC packet that was sent
   */
  constructor(
    private readonly connection: Connection,
    private readonly netId: number,
    private readonly packet: BaseRpcPacket,
  ) {
    super();
  }

  /**
   * Gets the connection to which the packet was sent.
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Gets the ID of the InnerNetObject that sent the packet.
   */
  getNetId(): number {
    return this.netId;
  }

  /**
   * Gets the InnerNetObject that sent the packet.
   *
   * @returns The InnerNetObject that sent the packet, or `undefined` if it does not exist
   */
  getSender(): BaseInnerNetObject | undefined {
    if (this.sender === undefined) {
      this.sender = this.connection.lobby?.findInnerNetObject(this.netId);
    }

    return this.sender;
  }

  /**
   * Gets the RPC packet that was sent.
   */
  getPacket(): BaseRpcPacket {
    return this.packet;
  }
}