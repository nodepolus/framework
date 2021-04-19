import { Hmac } from "../../src/util/hmac";
import test from "ava";

const message = "I like big butts and I cannot lie";
const modifiedMessage = message.replace("big", "small");
const messageBuffer = Buffer.from(message);
const modifiedMessageBuffer = Buffer.from(modifiedMessage);
const secret = "You other brothers can't deny";

test("it can sign a message", t => {
  const hash = Hmac.sign(messageBuffer, secret);

  t.true(/^[0-9a-f]{40}$/i.test(hash));
});

test("it can verify a message", t => {
  const hash = Hmac.sign(messageBuffer, secret);

  t.true(Hmac.verify(messageBuffer, hash, secret));
  t.false(Hmac.verify(modifiedMessageBuffer, hash, secret));
});
