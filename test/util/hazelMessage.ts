import { MessageReader, MessageWriter } from "../../src/util/hazelMessage";
import { CanSerializeToHazel, Vector2 } from "../../src/types";
import { MaxValue, MinValue } from "../../src/util/constants";
import { isFloatEqual } from "../../src/util/functions";
import test from "ava";

type Example = {
  someString: string;
  someNumber: number;
};

test("writes a message", t => {
  const buf = new MessageWriter();

  buf.startMessage(0x32);
  buf.startMessage(0x01);
  buf.writeString("some");
  buf.endMessage();
  buf.startMessage(0x02);
  buf.writeString("string");
  buf.endMessage();
  buf.endMessage();

  t.is(buf.getBuffer().toString("hex"), "12003205000104736f6d6507000206737472696e67");
});

test("reads a message", t => {
  const buf = MessageReader.fromMessage("12003205000104736f6d6507000206737472696e67");

  t.is(buf.getLength(), 0x0012);
  t.is(buf.getTag(), 0x32);

  const one = buf.readMessage();
  const two = buf.readMessage();

  t.truthy(one);
  t.is(one!.getLength(), 0x05);
  t.is(one!.getTag(), 0x01);
  t.is(one!.readString(), "some");
  t.false(one!.hasBytesLeft());

  t.truthy(two);
  t.is(two!.getLength(), 0x07);
  t.is(two!.getTag(), 0x02);
  t.is(two!.readString(), "string");
  t.false(two!.hasBytesLeft());

  t.false(buf.hasBytesLeft());
});

test("writes a boolean", t => {
  const buf = new MessageWriter();

  buf.writeBoolean(true);
  buf.writeBoolean(false);

  t.is(buf.getBuffer().toString("hex"), "0100");
  t.is(buf.getLength(), 2);
});

test("reads a boolean", t => {
  const buf = MessageReader.fromMessage("0200010100");

  t.true(buf.readBoolean());
  t.false(buf.readBoolean());
  t.false(buf.hasBytesLeft());
});

test("writes an int8", t => {
  const buf = new MessageWriter();

  buf.writeSByte(127);
  buf.writeSByte(-16);
  buf.writeSByte(86);
  buf.writeSByte(-128);

  t.is(buf.getBuffer().toString("hex"), "7ff05680");
  t.is(buf.getLength(), 4);
});

test("reads an int8", t => {
  const buf = MessageReader.fromMessage("0400017ff05680");

  t.is(buf.readSByte(), 127);
  t.is(buf.readSByte(), -16);
  t.is(buf.readSByte(), 86);
  t.is(buf.readSByte(), -128);
  t.false(buf.hasBytesLeft());
});

test("writes a uint8", t => {
  const buf = new MessageWriter();

  buf.writeByte(255);
  buf.writeByte(240);
  buf.writeByte(86);

  t.is(buf.getBuffer().toString("hex"), "fff056");
  t.is(buf.getLength(), 3);
});

test("reads a uint8", t => {
  const buf = MessageReader.fromMessage("030001fff056");

  t.is(buf.readByte(), 255);
  t.is(buf.readByte(), 240);
  t.is(buf.readByte(), 86);
  t.false(buf.hasBytesLeft());
});

test("writes an int16", t => {
  const buf = new MessageWriter();

  buf.writeInt16(32767);
  buf.writeInt16(-3856);
  buf.writeInt16(22102);
  buf.writeInt16(-32768);

  t.is(buf.getBuffer().toString("hex"), "ff7ff0f056560080");
  t.is(buf.getLength(), 8);
});

test("reads an int16", t => {
  const buf = MessageReader.fromMessage("080001ff7ff0f056560080");

  t.is(buf.readInt16(), 32767);
  t.is(buf.readInt16(), -3856);
  t.is(buf.readInt16(), 22102);
  t.is(buf.readInt16(), -32768);
  t.false(buf.hasBytesLeft());
});

test("writes a uint16", t => {
  const buf = new MessageWriter();

  buf.writeUInt16(65535);
  buf.writeUInt16(61680);
  buf.writeUInt16(22102);

  t.is(buf.getBuffer().toString("hex"), "fffff0f05656");
  t.is(buf.getLength(), 6);
});

test("reads a uint16", t => {
  const buf = MessageReader.fromMessage("060001fffff0f05656");

  t.is(buf.readUInt16(), 65535);
  t.is(buf.readUInt16(), 61680);
  t.is(buf.readUInt16(), 22102);
  t.false(buf.hasBytesLeft());
});

test("writes an int32", t => {
  const buf = new MessageWriter();

  buf.writeInt32(2147483647);
  buf.writeInt32(-252645136);
  buf.writeInt32(1448498774);
  buf.writeInt32(-2147483648);

  t.is(buf.getBuffer().toString("hex"), "ffffff7ff0f0f0f05656565600000080");
  t.is(buf.getLength(), 16);
});

test("reads an int32", t => {
  const buf = MessageReader.fromMessage("100001ffffff7ff0f0f0f05656565600000080");

  t.is(buf.readInt32(), 2147483647);
  t.is(buf.readInt32(), -252645136);
  t.is(buf.readInt32(), 1448498774);
  t.is(buf.readInt32(), -2147483648);
  t.false(buf.hasBytesLeft());
});

test("writes a uint32", t => {
  const buf = new MessageWriter();

  buf.writeUInt32(4294967295);
  buf.writeUInt32(4042322160);
  buf.writeUInt32(1448498774);

  t.is(buf.getBuffer().toString("hex"), "fffffffff0f0f0f056565656");
  t.is(buf.getLength(), 12);
});

test("reads a uint32", t => {
  const buf = MessageReader.fromMessage("0c0001fffffffff0f0f0f056565656");

  t.is(buf.readUInt32(), 4294967295);
  t.is(buf.readUInt32(), 4042322160);
  t.is(buf.readUInt32(), 1448498774);
  t.false(buf.hasBytesLeft());
});

test("writes a float32", t => {
  const buf = new MessageWriter();

  buf.writeFloat32(-10000);
  buf.writeFloat32(10000);
  buf.writeFloat32(1);

  t.is(buf.getBuffer().toString("hex"), "00401cc600401c460000803f");
  t.is(buf.getLength(), 12);
});

test("reads a float32", t => {
  const buf = MessageReader.fromMessage("0c000100401cc600401c460000803f");

  t.is(buf.readFloat32(), -10000);
  t.is(buf.readFloat32(), 10000);
  t.is(buf.readFloat32(), 1);
  t.false(buf.hasBytesLeft());
});

test("writes a vector2", t => {
  const buf = new MessageWriter();

  buf.writeVector2(new Vector2(0, 0));
  buf.writeVector2(new Vector2(50, -50));

  t.is(buf.getBuffer().toString("hex"), "ff7fff7fffff0000");
});

test("reads a Vector2", t => {
  const buf = MessageReader.fromRawBytes("ff7fff7fffff0000");
  const one = buf.readVector2();
  const two = buf.readVector2();

  t.false(buf.hasBytesLeft());
  t.true(isFloatEqual(one.getX(), 0, 0.001));
  t.true(isFloatEqual(one.getY(), 0, 0.001));
  t.true(isFloatEqual(two.getX(), 50, 0.001));
  t.true(isFloatEqual(two.getY(), -50, 0.001));
});

test("writes a string", t => {
  const buf = new MessageWriter();

  buf.writeString("Hello");
  buf.writeString(" ".repeat(1024));
  buf.writeString("Дмитрий Иванович Петров");
  buf.writeString("");

  t.is(
    buf.getBuffer().toString("hex"),
    "0548656c6c6f8008202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202cd094d0bcd0b8d182d180d0b8d0b920d098d0b2d0b0d0bdd0bed0b2d0b8d18720d09fd0b5d182d180d0bed0b200",
  );
  t.is(buf.getLength(), 1078);
});

test("reads a string", t => {
  const buf = MessageReader.fromMessage(
    "3604010548656c6c6f8008202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202cd094d0bcd0b8d182d180d0b8d0b920d098d0b2d0b0d0bdd0bed0b2d0b8d18720d09fd0b5d182d180d0bed0b200",
  );

  t.is(buf.readString(), "Hello");
  t.is(buf.readString(), " ".repeat(1024));
  t.is(buf.readString(), "Дмитрий Иванович Петров");
  t.is(buf.readString(), "");
  t.false(buf.hasBytesLeft());
});

test("writes a packed int32", t => {
  const buf = new MessageWriter();

  buf.writePackedInt32(0);
  buf.writePackedInt32(1);
  buf.writePackedInt32(2);
  buf.writePackedInt32(127);
  buf.writePackedInt32(128);
  buf.writePackedInt32(255);
  buf.writePackedInt32(2097151);
  buf.writePackedInt32(2147483647);
  buf.writePackedInt32(-1);
  buf.writePackedInt32(-2147483648);

  t.is(buf.getBuffer().toString("hex"), "0001027f8001ff01ffff7fffffffff07ffffffff0f8080808008");
  t.is(buf.getLength(), 26);
});

test("reads a packed int32", t => {
  const buf = MessageReader.fromMessage("1a00010001027f8001ff01ffff7fffffffff07ffffffff0f8080808008");

  t.is(buf.readPackedInt32(), 0);
  t.is(buf.readPackedInt32(), 1);
  t.is(buf.readPackedInt32(), 2);
  t.is(buf.readPackedInt32(), 127);
  t.is(buf.readPackedInt32(), 128);
  t.is(buf.readPackedInt32(), 255);
  t.is(buf.readPackedInt32(), 2097151);
  t.is(buf.readPackedInt32(), 2147483647);
  t.is(buf.readPackedInt32(), -1);
  t.is(buf.readPackedInt32(), -2147483648);
  t.false(buf.hasBytesLeft());
});

test("writes a packed uint32", t => {
  const buf = new MessageWriter();

  buf.writePackedUInt32(0);
  buf.writePackedUInt32(1);
  buf.writePackedUInt32(2);
  buf.writePackedUInt32(127);
  buf.writePackedUInt32(128);
  buf.writePackedUInt32(255);
  buf.writePackedUInt32(2097151);
  buf.writePackedUInt32(2147483647);
  buf.writePackedUInt32(4294967295);
  buf.writePackedUInt32(2147483648);

  t.is(buf.getBuffer().toString("hex"), "0001027f8001ff01ffff7fffffffff07ffffffff0f8080808008");
  t.is(buf.getLength(), 26);
});

test("reads a packed uint32", t => {
  const buf = MessageReader.fromMessage("1a00010001027f8001ff01ffff7fffffffff07ffffffff0f8080808008");

  t.is(buf.readPackedUInt32(), 0);
  t.is(buf.readPackedUInt32(), 1);
  t.is(buf.readPackedUInt32(), 2);
  t.is(buf.readPackedUInt32(), 127);
  t.is(buf.readPackedUInt32(), 128);
  t.is(buf.readPackedUInt32(), 255);
  t.is(buf.readPackedUInt32(), 2097151);
  t.is(buf.readPackedUInt32(), 2147483647);
  t.is(buf.readPackedUInt32(), 4294967295);
  t.is(buf.readPackedUInt32(), 2147483648);
  t.false(buf.hasBytesLeft());
});

test("writes bytes", t => {
  const buf = new MessageWriter();

  buf.writeBytes([0, 1, 2, 3]);

  t.is(buf.getBuffer().toString("hex"), "00010203");
});

test("reads bytes", t => {
  const buf = MessageReader.fromMessage("0200010a0b");

  t.is(buf.readBytes(2).getBuffer().toString("hex"), "0a0b");
});

test("reads bytes as a string", t => {
  const one = MessageReader.fromRawBytes("68656c6c6f2c20776f726c64");
  const two = MessageReader.fromRawBytes("680065006c006c006f002c00200077006f0072006c006400");

  t.is(one.readBytesAsString(2, "ascii"), "he");
  t.is(one.readBytesAsString(2, "utf8"), "ll");
  t.is(one.readBytesAsString(2, "utf-8"), "o,");
  t.is(one.readBytesAsString(2, "latin1"), " w");
  t.is(one.readBytesAsString(2, "binary"), "or");
  t.is(one.readBytesAsString(2, "hex"), "6c64");

  t.is(two.readBytesAsString(6, "utf16le"), "hel");
  t.is(two.readBytesAsString(6, "ucs2"), "lo,");
  t.is(two.readBytesAsString(6, "ucs-2"), " wo");
  t.is(two.readBytesAsString(6, "hex"), "72006c006400");
});

test("writes a list", t => {
  const buf = new MessageWriter();
  const list = [1, 2, 3];

  buf.startMessage(1);
  buf.writeList(list, (writer, item) => writer.writeInt32(item));
  buf.endMessage();

  t.is(buf.getBuffer().toString("hex"), "0d000103010000000200000003000000");
});

test("writes a list without length", t => {
  const buf = new MessageWriter();
  const list = [1, 2, 3];

  buf.startMessage(1);
  buf.writeListWithoutLength(list, (writer, item) => writer.writeInt32(item));
  buf.endMessage();

  t.is(buf.getBuffer().toString("hex"), "0c0001010000000200000003000000");
});

test("writes a list of custom messages", t => {
  const buf = new MessageWriter();
  const items: Example[] = [
    { someString: "Jenny",
      someNumber: 8675309 },
    { someString: "Minutes",
      someNumber: 525600 },
  ];

  buf.startMessage(0);
  buf.writeList(items, (writer, item, idx) => {
    writer.startMessage(idx);
    writer.writeString(item.someString);
    writer.writeUInt32(item.someNumber);
    writer.endMessage();
  });
  buf.endMessage();

  t.is(buf.getBuffer().toString("hex"), "1d0000020a0000054a656e6e79ed5f84000c0001074d696e7574657320050800");
});

test("reads a list", t => {
  const buf = MessageReader.fromMessage("0d000103010000000200000003000000");
  const results = buf.readList(sub => sub.readInt32());

  t.is(results.length, 3);
  t.is(results[0], 1);
  t.is(results[1], 2);
  t.is(results[2], 3);
  t.false(buf.hasBytesLeft());
});

test("reads a list of custom messages", t => {
  const buf = MessageReader.fromMessage("1d0000020a0000054a656e6e79ed5f84000c0001074d696e7574657320050800");
  const results = buf.readMessageList(
    (sub): Example => ({
      someString: sub.readString(),
      someNumber: sub.readUInt32(),
    }),
  );

  t.is(results.length, 2);
  t.is(results[0].someString, "Jenny");
  t.is(results[0].someNumber, 8675309);
  t.is(results[1].someString, "Minutes");
  t.is(results[1].someNumber, 525600);
  t.false(buf.hasBytesLeft());
});

test("writes a message list", t => {
  const buf = new MessageWriter();
  const items: Example[] = [
    { someString: "Jenny",
      someNumber: 8675309 },
    { someString: "Minutes",
      someNumber: 525600 },
  ];

  buf.startMessage(0);
  buf.writeMessageList(items, (writer, item) => {
    writer.writeString(item.someString);
    writer.writeUInt32(item.someNumber);
  });
  buf.endMessage();

  t.is(buf.getBuffer().toString("hex"), "1d0000020a0000054a656e6e79ed5f84000c0000074d696e7574657320050800");
});

test("reads a message list", t => {
  const buf = MessageReader.fromMessage("1300010205000104736f6d6507000206737472696e67", true);
  const results = buf.readMessageList(sub => sub.readString());

  t.is(results.length, 2);
  t.is(results[0], "some");
  t.is(results[1], "string");
  t.false(buf.hasBytesLeft());
});

test("reads a message list of typed objects", t => {
  const buf = MessageReader.fromMessage("1d0000020a0000054a656e6e79ed5f84000c0001074d696e7574657320050800", true);
  const results = buf.readMessageList(
    (sub): Example => ({
      someString: sub.readString(),
      someNumber: sub.readUInt32(),
    }),
  );

  t.is(results.length, 2);
  t.is(results[0].someString, "Jenny");
  t.is(results[0].someNumber, 8675309);
  t.is(results[1].someString, "Minutes");
  t.is(results[1].someNumber, 525600);
  t.false(buf.hasBytesLeft());
});

test("reads all child messages", t => {
  const buf = MessageReader.fromMessage("2300010f00030a576f7273742079656172e40700000e000509426573742079656172b1070000");
  const results: Example[] = [];

  buf.readAllChildMessages(child => {
    results.push({
      someString: child.readString(),
      someNumber: child.readUInt32(),
    });
  });

  t.is(results.length, 2);
  t.is(results[0].someString, "Worst year");
  t.is(results[0].someNumber, 2020);
  t.is(results[1].someString, "Best year");
  t.is(results[1].someNumber, 1969);
  t.false(buf.hasBytesLeft());
});

test("reads all child messages even if they are empty", t => {
  const buf = MessageReader.fromMessage("2600010f00030a576f7273742079656172e40700000e000509426573742079656172b1070000000000");
  const results: Example[] = [];

  buf.readAllChildMessages(child => {
    if (child.getLength() <= 0) {
      return;
    }

    results.push({
      someString: child.readString(),
      someNumber: child.readUInt32(),
    });
  });

  t.is(results.length, 2);
  t.is(results[0].someString, "Worst year");
  t.is(results[0].someNumber, 2020);
  t.is(results[1].someString, "Best year");
  t.is(results[1].someNumber, 1969);
  t.false(buf.hasBytesLeft());
});

test("writes bytes and size", t => {
  const rawBytes = "69".repeat(128);
  const rawParsed = new MessageWriter(rawBytes, true);
  const buf = new MessageWriter();

  buf.writeBytesAndSize(rawParsed);
  buf.writeByte(3);
  buf.writeByte(2);
  buf.writeByte(1);
  buf.writeByte(0);

  t.is(buf.getBuffer().toString("hex"), `8001${rawBytes}03020100`);
});

test("reads bytes and size", t => {
  const rawBytes = "69".repeat(128);
  const buf = MessageReader.fromRawBytes(`8001${rawBytes}03020100`);
  const bytes = buf.readBytesAndSize();

  t.is(buf.getReadableBytesLength(), 4);
  t.is(bytes.getLength(), 128);
  t.is(buf.readRemainingBytes().getBuffer().toString("hex"), "03020100");
  t.is(bytes.getBuffer().toString("hex"), rawBytes);
});

test("reads remaining bytes", t => {
  const buf = MessageReader.fromMessage("0d00010600010f68656c6c6f66e6f642");
  const child = buf.readMessage();

  t.false(typeof child == "undefined");
  t.is(child!.readByte(), 15);
  t.is(child!.readRemainingBytes().getBuffer().toString(), "hello");
  t.false(child!.hasBytesLeft());
  t.is(buf.readUInt32(), 1123477094);
  t.false(buf.hasBytesLeft());
});

test("writes an object", t => {
  const buf = new MessageWriter();
  const myObject: CanSerializeToHazel = {
    serialize(writer: MessageWriter): void {
      writer.writeString("cody was here").writeUInt16(420);
    },
  };

  buf.startMessage(69);
  buf.writeObject(myObject);
  buf.endMessage();

  t.is(buf.getBuffer().toString("hex"), "1000450d636f6479207761732068657265a401");
});

test("throws an error when writing values outside of the allowed range", t => {
  const buf = new MessageWriter();

  t.throws(() => buf.writeSByte(MinValue.Int8 - 1));
  t.throws(() => buf.writeSByte(MaxValue.Int8 + 1));

  t.throws(() => buf.writeByte(MinValue.UInt8 - 1));
  t.throws(() => buf.writeByte(MaxValue.UInt8 + 1));

  t.throws(() => buf.writeInt16(MinValue.Int16 - 1));
  t.throws(() => buf.writeInt16(MaxValue.Int16 + 1));

  t.throws(() => buf.writeUInt16(MinValue.UInt16 - 1));
  t.throws(() => buf.writeUInt16(MaxValue.UInt16 + 1));

  t.throws(() => buf.writeInt32(MinValue.Int32 - 1));
  t.throws(() => buf.writeInt32(MaxValue.Int32 + 1));

  t.throws(() => buf.writeUInt32(MinValue.UInt32 - 1));
  t.throws(() => buf.writeUInt32(MaxValue.UInt32 + 1));

  t.throws(() => buf.writePackedInt32(MinValue.Int32 - 1));
  t.throws(() => buf.writePackedInt32(MaxValue.Int32 + 1));

  t.throws(() => buf.writePackedUInt32(MinValue.UInt32 - 1));
  t.throws(() => buf.writePackedUInt32(MaxValue.UInt32 + 1));
});

test("throws an error when trying to end a message without an open message", t => {
  const buf = new MessageWriter();

  t.throws(() => buf.endMessage());
});

test("throws an error when writing a message that is too large", t => {
  const buf = new MessageWriter();

  buf.startMessage(0);

  buf.writeBytes(Array(MaxValue.UInt16 + 1).fill(false));

  t.throws(() => buf.endMessage());
});

test("throws an error when reading more bytes than are avaialble", t => {
  const buf = MessageReader.fromRawBytes("0102030405");

  t.is(buf.readByte(), 1);
  t.is(buf.getReadableBytesLength(), 4);
  t.throws(() => buf.readBytes(5));
  t.is(buf.getReadableBytesLength(), 4);
  t.is(buf.readBytes(4).getBuffer().toString("hex"), "02030405");
  t.false(buf.hasBytesLeft());
});

test("peeks at a single byte", t => {
  const buf = MessageReader.fromRawBytes("0102030405");

  t.is(buf.peek(1), 2);
  t.is(buf.getCursor(), 0);
});

test("peeks at multiple bytes", t => {
  const buf = MessageReader.fromRawBytes("0102030405");

  t.deepEqual(buf.peek(1, 3), [2, 3, 4]);
  t.is(buf.getCursor(), 0);
});

test("clones itself as a MessageReader", t => {
  const buf = MessageReader.fromRawBytes("12003205000104736f6d6507000206737472696e67");

  buf.readBytes(4);

  const clone = buf.clone();

  buf.readBytes(2);

  t.is(buf.getCursor(), 6);
  t.is(clone.getCursor(), 4);
  t.true(buf.getLength() == clone.getLength());
});

test("clones itself as a MessageWriter", t => {
  const buf = new MessageWriter("12003205000104736f6d6507000206737472696e67", true);
  const clone = buf.clone();

  buf.writeBoolean(true);

  t.is(buf.getCursor(), 22);
  t.is(clone.getCursor(), 21);
  t.is(buf.getLength(), 22);
  t.is(clone.getLength(), 21);
});

test("converts to a string", t => {
  const one = MessageReader.fromRawBytes("68656c6c6f2c20776f726c64");
  const two = MessageReader.fromRawBytes("680065006c006c006f002c00200077006f0072006c006400");

  t.is(one.toString(), "hello, world");
  t.is(one.toString("ascii"), "hello, world");
  t.is(one.toString("ascii", 7), "world");
  t.is(one.toString("ascii", 7, 9), "wo");
  t.is(one.toString("utf8"), "hello, world");
  t.is(one.toString("utf8", 7), "world");
  t.is(one.toString("utf8", 7, 9), "wo");
  t.is(one.toString("utf-8"), "hello, world");
  t.is(one.toString("utf-8", 7), "world");
  t.is(one.toString("utf-8", 7, 9), "wo");
  t.is(one.toString("latin1"), "hello, world");
  t.is(one.toString("latin1", 7), "world");
  t.is(one.toString("latin1", 7, 9), "wo");
  t.is(one.toString("binary"), "hello, world");
  t.is(one.toString("binary", 7), "world");
  t.is(one.toString("binary", 7, 9), "wo");
  t.is(one.toString("base64"), "aGVsbG8sIHdvcmxk");
  t.is(one.toString("hex"), "68656c6c6f2c20776f726c64");
  t.is(one.toString("hex", 1), "656c6c6f2c20776f726c64");
  t.is(one.toString("hex", 1, 4), "656c6c");

  t.is(two.toString("utf16le"), "hello, world");
  t.is(two.toString("utf16le", 14), "world");
  t.is(two.toString("utf16le", 14, 18), "wo");
  t.is(two.toString("ucs2"), "hello, world");
  t.is(two.toString("ucs2", 14), "world");
  t.is(two.toString("ucs2", 14, 18), "wo");
  t.is(two.toString("ucs-2"), "hello, world");
  t.is(two.toString("ucs-2", 14), "world");
  t.is(two.toString("ucs-2", 14, 18), "wo");
  t.is(two.toString("hex"), "680065006c006c006f002c00200077006f0072006c006400");
  t.is(two.toString("hex", 2), "65006c006c006f002c00200077006f0072006c006400");
  t.is(two.toString("hex", 2, 8), "65006c006c00");
});
