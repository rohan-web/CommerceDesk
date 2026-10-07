import { User } from "./models/User";
import type { ClientSession } from "mongoose";
import { decryptSecret } from "./secrets";
import { hashRecoveryCode, totpCounterForCode } from "./domain/totp";

type MfaUser = { _id: unknown; mfaEnabledAt?: Date | null; mfaSecretEncrypted?: string | null; mfaRecoveryHashes?: string[]; mfaLastCounter?: number };

/** Atomically consumes a TOTP counter or a one-time recovery hash. */
export async function consumeMfaFactor(user: MfaUser, code: string, session?: ClientSession): Promise<boolean> {
  if (!user.mfaEnabledAt) return false;
  if (/^\d{6}$/.test(code) && user.mfaSecretEncrypted) {
    let secret: string;
    try { secret = decryptSecret(user.mfaSecretEncrypted); } catch { return false; }
    const counter = totpCounterForCode(secret, code);
    if (counter === null || counter <= (user.mfaLastCounter ?? -1)) return false;
    const result = await User.updateOne({ _id: user._id, mfaEnabledAt: { $ne: null }, mfaLastCounter: { $lt: counter } }, { $set: { mfaLastCounter: counter } }, session ? { session } : {});
    return result.modifiedCount === 1;
  }
  if (!user.mfaRecoveryHashes?.length || code.length < 8 || code.length > 64) return false;
  const hash = hashRecoveryCode(code);
  const result = await User.updateOne({ _id: user._id, mfaEnabledAt: { $ne: null }, mfaRecoveryHashes: hash }, { $pull: { mfaRecoveryHashes: hash } }, session ? { session } : {});
  return result.modifiedCount === 1;
}
