import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0, value = 0, output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

export function decodeBase32(value: string): Buffer {
  const source = value.toUpperCase().replace(/[\s=-]/g, "");
  if (!source || source.length > 128 || !/^[A-Z2-7]+$/.test(source)) throw new Error("Invalid Base32 secret.");
  let bits = 0, accumulator = 0;
  const bytes: number[] = [];
  for (const char of source) {
    accumulator = (accumulator << 5) | alphabet.indexOf(char); bits += 5;
    if (bits >= 8) { bytes.push((accumulator >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string { return encodeBase32(randomBytes(20)); }

export function hotp(secret: string, counter: number, digits = 6): string {
  if (!Number.isSafeInteger(counter) || counter < 0 || !Number.isInteger(digits) || digits < 6 || digits > 8) throw new RangeError("Invalid TOTP counter or digit count.");
  const counterBytes = Buffer.alloc(8); counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % (10 ** digits)).padStart(digits, "0");
}

export function totpCounterForCode(secret: string, code: string, nowMs = Date.now(), window = 1): number | null {
  if (!/^\d{6}$/.test(code) || !Number.isFinite(nowMs) || !Number.isInteger(window) || window < 0 || window > 2) return null;
  let key: Buffer;
  try { key = decodeBase32(secret); } catch { return null; }
  if (key.length < 10) return null;
  const center = Math.floor(nowMs / 30_000), supplied = Buffer.from(code);
  let match: number | null = null;
  for (let shift = -window; shift <= window; shift++) {
    const counter = center + shift;
    if (counter < 0) continue;
    const expected = Buffer.from(hotp(secret, counter));
    if (timingSafeEqual(expected, supplied)) match = counter;
  }
  return match;
}

export function hashRecoveryCode(code: string): string {
  return createHmac("sha256", "commercedesk-mfa-recovery-v1").update(code.trim().toLowerCase()).digest("hex");
}
