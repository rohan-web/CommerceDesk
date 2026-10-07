import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { NextResponse } from "next/server";
import { readSession } from "@/server/auth";
import { connectDatabase } from "@/server/db";
import { AuditEvent } from "@/server/models/AuditEvent";
import { Session } from "@/server/models/Session";
import { User } from "@/server/models/User";
import { consumeMfaFactor } from "@/server/mfa";
import { decryptSecret, encryptSecret, hasValidEncryptionKey, verifyPassword } from "@/server/secrets";
import { isSameOrigin, readJsonLimited } from "@/server/request-security";
import { encodeBase32, generateTotpSecret, hashRecoveryCode, totpCounterForCode } from "@/server/domain/totp";

export const dynamic = "force-dynamic";
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("begin"), password: z.string().min(1).max(128) }).strict(),
  z.object({ action: z.literal("confirm"), code: z.string().regex(/^\d{6}$/) }).strict(),
  z.object({ action: z.literal("disable"), password: z.string().min(1).max(128), code: z.string().min(6).max(64) }).strict(),
  z.object({ action: z.literal("regenerate"), password: z.string().min(1).max(128), code: z.string().min(6).max(64) }).strict(),
]);
const noStore = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  if (error instanceof Error && ["BAD_MFA_CODE", "BAD_PASSWORD"].includes(error.message)) return NextResponse.json({ error: error.message === "BAD_PASSWORD" ? "Password is incorrect." : "Authenticator or recovery code is invalid or already used." }, { status: 400 });
  if (error instanceof Error && ["MFA_ALREADY_ENABLED", "MFA_NOT_ENABLED", "MFA_ENROLLMENT_EXPIRED"].includes(error.message)) return NextResponse.json({ error: error.message.replaceAll("_", " ").toLowerCase() }, { status: 409 });
  return NextResponse.json({ error: "Account security could not be updated." }, { status: 503 });
}
async function audit(identity: { tenantId: string; userId: string }, action: string, session?: mongoose.ClientSession) {
  await AuditEvent.create([{ tenantId: identity.tenantId, actorId: identity.userId, action, entityType: "user", entityId: identity.userId, requestId: randomBytes(12).toString("hex"), metadata: {} }], session ? { session } : {});
}
async function revokeOtherSessions(identity: { userId: string; sessionId: string }, session: mongoose.ClientSession) {
  await Session.updateMany({ userId: identity.userId, revokedAt: null, _id: { $ne: identity.sessionId } }, { $set: { revokedAt: new Date() } }, { session });
}

export async function GET() {
  const identity = await readSession();
  if (!identity) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  try {
    await connectDatabase();
    const user = await User.findById(identity.userId).select("mfaEnabledAt +mfaRecoveryHashes").lean();
    if (!user) return NextResponse.json({ error: "Account was not found." }, { status: 401 });
    return NextResponse.json({ enabled: Boolean(user.mfaEnabledAt), enabledAt: user.mfaEnabledAt, recoveryCodesRemaining: user.mfaEnabledAt ? user.mfaRecoveryHashes?.length ?? 0 : 0 }, { headers: noStore });
  } catch { return NextResponse.json({ error: "Account security could not be loaded." }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  const identity = await readSession();
  if (!identity) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const inputResult = await readJsonLimited(request, 4000);
  if (inputResult.kind === "too-large") return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  const parsed = bodySchema.safeParse(inputResult.kind === "ok" ? inputResult.value : null);
  if (!parsed.success) return NextResponse.json({ error: "Review the authenticator details and try again." }, { status: 400 });
  if (!hasValidEncryptionKey()) return NextResponse.json({ error: "MFA requires a valid APP_ENCRYPTION_KEY." }, { status: 503 });

  try {
    await connectDatabase();
    if (parsed.data.action === "begin") {
      const user = await User.findById(identity.userId).select("email mfaEnabledAt +passwordHash");
      if (!user) return NextResponse.json({ error: "Account was not found." }, { status: 401 });
      if (user.mfaEnabledAt) return NextResponse.json({ error: "MFA is already enabled." }, { status: 409 });
      if (!(await verifyPassword(parsed.data.password, user.passwordHash!))) return failure(new Error("BAD_PASSWORD"));
      const secret = generateTotpSecret(), expiresAt = new Date(Date.now() + 10 * 60_000);
      user.set({ mfaPendingSecretEncrypted: encryptSecret(secret), mfaPendingExpiresAt: expiresAt });
      await user.save();
      const label = encodeURIComponent(`CommerceDesk:${user.email}`), issuer = encodeURIComponent("CommerceDesk");
      const otpauthUri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
      return NextResponse.json({ secret, otpauthUri, expiresAt }, { headers: noStore });
    }

    if (parsed.data.action === "confirm") {
      const confirmCode = parsed.data.code;
      const session = await mongoose.startSession(); let recoveryCodes: string[] = [];
      try {
        await session.withTransaction(async () => {
          const user = await User.findById(identity.userId).select("email mfaEnabledAt mfaPendingExpiresAt +mfaPendingSecretEncrypted").session(session).lean();
          if (user?.mfaEnabledAt) throw new Error("MFA_ALREADY_ENABLED");
          if (!user?.mfaPendingSecretEncrypted || !user.mfaPendingExpiresAt || user.mfaPendingExpiresAt <= new Date()) throw new Error("MFA_ENROLLMENT_EXPIRED");
          const secret = decryptSecret(user.mfaPendingSecretEncrypted), counter = totpCounterForCode(secret, confirmCode);
          if (counter === null) throw new Error("BAD_MFA_CODE");
          recoveryCodes = Array.from({ length: 10 }, () => randomBytes(9).toString("base64url").toUpperCase());
          const result = await User.updateOne({ _id: user._id, mfaEnabledAt: null, mfaPendingExpiresAt: { $gt: new Date() } }, {
            $set: { mfaSecretEncrypted: encryptSecret(secret), mfaEnabledAt: new Date(), mfaRecoveryHashes: recoveryCodes.map(hashRecoveryCode), mfaLastCounter: counter },
            $unset: { mfaPendingSecretEncrypted: 1, mfaPendingExpiresAt: 1 },
          }, { session });
          if (result.modifiedCount !== 1) throw new Error("MFA_ENROLLMENT_EXPIRED");
          await audit(identity, "account.mfa_enabled", session);
          await revokeOtherSessions(identity, session);
        });
      } catch (error) { return failure(error); }
      finally { await session.endSession(); }
      return NextResponse.json({ enabled: true, recoveryCodes }, { headers: noStore });
    }

    if (parsed.data.action !== "disable" && parsed.data.action !== "regenerate") return NextResponse.json({ error: "Unsupported account security action." }, { status: 400 });
    const change = parsed.data as Extract<z.infer<typeof bodySchema>, { action: "disable" | "regenerate" }>;
    const action = change.action;
    const session = await mongoose.startSession(); let recoveryCodes: string[] = [];
    try {
      await session.withTransaction(async () => {
        const user = await User.findById(identity.userId).select("mfaEnabledAt mfaLastCounter +passwordHash +mfaSecretEncrypted +mfaRecoveryHashes").session(session).lean();
        if (!user?.mfaEnabledAt) throw new Error("MFA_NOT_ENABLED");
        if (!(await verifyPassword(change.password, user.passwordHash!))) throw new Error("BAD_PASSWORD");
        if (!(await consumeMfaFactor(user, change.code, session))) throw new Error("BAD_MFA_CODE");
        if (action === "disable") {
          await User.updateOne({ _id: user._id, mfaEnabledAt: { $ne: null } }, { $set: { mfaEnabledAt: null, mfaRecoveryHashes: [], mfaLastCounter: -1 }, $unset: { mfaSecretEncrypted: 1, mfaPendingSecretEncrypted: 1, mfaPendingExpiresAt: 1 } }, { session });
          await revokeOtherSessions(identity, session);
          await audit(identity, "account.mfa_disabled", session);
        } else {
          recoveryCodes = Array.from({ length: 10 }, () => randomBytes(9).toString("base64url").toUpperCase());
          await User.updateOne({ _id: user._id, mfaEnabledAt: { $ne: null } }, { $set: { mfaRecoveryHashes: recoveryCodes.map(hashRecoveryCode) } }, { session });
          await audit(identity, "account.mfa_recovery_codes_regenerated", session);
        }
      });
    } catch (error) { return failure(error); }
    finally { await session.endSession(); }
    return NextResponse.json(action === "disable" ? { enabled: false } : { enabled: true, recoveryCodes }, { headers: noStore });
  } catch { return NextResponse.json({ error: "Account security could not be updated." }, { status: 503 }); }
}
