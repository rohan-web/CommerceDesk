import assert from "node:assert/strict";
import test from "node:test";
import { decodeBase32, encodeBase32, hashRecoveryCode, hotp, totpCounterForCode } from "../src/server/domain/totp.ts";

test("Base32 encoding and decoding round-trip known bytes", () => {
  const bytes = Buffer.from("foobar");
  assert.equal(encodeBase32(bytes), "MZXW6YTBOI");
  assert.deepEqual(decodeBase32("mzxw6ytb-oi=="), bytes);
});

test("HOTP matches RFC 4226 vectors", () => {
  const secret = encodeBase32(Buffer.from("12345678901234567890"));
  assert.deepEqual(Array.from({ length: 10 }, (_, counter) => hotp(secret, counter)), ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"]);
});

test("TOTP accepts only its time window and returns the matching counter", () => {
  const secret = encodeBase32(Buffer.from("12345678901234567890")), now = 1_700_000_000_000;
  const counter = Math.floor(now / 30_000);
  assert.equal(totpCounterForCode(secret, hotp(secret, counter), now), counter);
  assert.equal(totpCounterForCode(secret, "12345", now), null);
  assert.equal(totpCounterForCode(secret, "000000", now, 0), hotp(secret, counter) === "000000" ? counter : null);
  assert.equal(totpCounterForCode("bad", "123456", now), null);
});

test("recovery-code hashes normalize case and whitespace", () => {
  assert.equal(hashRecoveryCode("  AbCdEf12  "), hashRecoveryCode("abcdef12"));
});
