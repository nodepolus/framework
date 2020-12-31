import { HostGameResponsePacket } from "../../protocol/packets/root";
import { InternalLobby } from "../../lobby";

export class CodeObject {
  private internalValue: string;
  private internalIsHidden = false;
  private internalIsRemoved = false;

  get value(): string {
    return this.internalValue;
  }

  get isHidden(): boolean {
    return this.internalIsHidden;
  }

  get isRemoved(): boolean {
    return this.internalIsRemoved;
  }

  private static get hiddenCode(): string {
    return "A[][";
  }

  private static get removedCode(): string {
    return "9999";
  }

  constructor(
    value: string,
    public lobby: InternalLobby,
  ) {
    this.internalValue = CodeObject.convertToInternal(value);
  }

  static convertToInternal(code: string): string {
    switch (code.length) {
      case 1:
        if (/^[A-Z\\^_`]+$/.test(code) && code.split("[").length == 2) {
          return `${code}[A]`;
        }

        throw new Error(`Invalid 1-character lobby code, codes may only contain A-Z, \\, ^, _, and \`: ${code}`);
      case 2:
        if (/^[A-Z\\^_`]+$/.test(code) && code.split("[").length == 2) {
          return `${code}[]`;
        }

        throw new Error(`Invalid 2-character lobby code, codes may only contain A-Z, \\, ^, _, and \`: ${code}`);
      case 3:
        if (/^[A-Z[\\^_`]+$/.test(code) && code.split("[").length == 2) {
          return code.split("[").join("[[");
        }

        throw new Error(`Invalid 3-character lobby code, codes may only contain A-Z, [, \\, ^, _, and \`, and must contain exactly one [: ${code}`);
      case 4:
        if (/^[A-Z[\\\]^_`]+$/.test(code)) {
          return code;
        }

        throw new Error(`Invalid 4-character lobby code, codes may only contain A-Z, [, \\, ], ^, _, and \`: ${code}`);
      case 6:
        if (/^[A-Z]+$/.test(code)) {
          return code;
        }

        throw new Error(`Invalid 6-character lobby code, codes may only contain A-Z: ${code}`);
      default:
        throw new Error(`Invalid lobby code, expected 1-4 or 6 characters: ${code}`);
    }
  }

  set(code: string): void {
    this.internalValue = CodeObject.convertToInternal(code);

    if (!this.internalIsHidden && !this.internalIsRemoved) {
      this.lobby.sendRootGamePacket(new HostGameResponsePacket(this.internalValue));
    }
  }

  hide(): void {
    this.internalIsHidden = true;

    if (!this.internalIsRemoved) {
      this.lobby.sendRootGamePacket(new HostGameResponsePacket(CodeObject.hiddenCode));
    }
  }

  show(): void {
    this.internalIsHidden = false;

    if (!this.internalIsRemoved) {
      this.lobby.sendRootGamePacket(new HostGameResponsePacket(this.internalValue));
    }
  }

  remove(): void {
    this.internalIsRemoved = true;

    this.lobby.sendRootGamePacket(new HostGameResponsePacket(CodeObject.removedCode));
  }

  restore(): void {
    this.internalIsRemoved = false;

    this.lobby.sendRootGamePacket(new HostGameResponsePacket(this.internalValue));
  }
}
