import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { membershipScopeProjection, scopeFromMembership } from "../src/server/domain/tenant-scope.ts";
import { Membership } from "../src/server/models/Membership.ts";
import { Tenant } from "../src/server/models/Tenant.ts";
import { User } from "../src/server/models/User.ts";

const testUri = process.env.MONGODB_TEST_URI;

test("replica-set membership projection resolves the correct tenant scope", { skip: !testUri }, async () => {
  await mongoose.connect(testUri!);
  let tenantId: mongoose.Types.ObjectId | undefined;
  let userId: mongoose.Types.ObjectId | undefined;
  try {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const [tenant] = await Tenant.create([{ name: "Tenant Scope Integration", slug: `scope-test-${suffix}`, deploymentMode: "standalone", commerceMode: "native", baseCurrency: "USD", timezone: "UTC" }]);
    tenantId = tenant._id;
    const [user] = await User.create([{ name: "Scope Test", email: `scope-${suffix}@example.test`, passwordHash: "test-only-hash" }]);
    userId = user._id;
    await Membership.create({ tenantId, userId, role: "owner" });

    const membership = await Membership.findOne({ tenantId, userId, revokedAt: null }).select(membershipScopeProjection).lean();
    assert.ok(membership);
    assert.equal(scopeFromMembership({ userId: String(userId) }, membership).tenantId, String(tenantId));
  } finally {
    if (tenantId && userId) await Membership.deleteMany({ tenantId, userId });
    if (tenantId) await Tenant.deleteOne({ _id: tenantId });
    if (userId) await User.deleteOne({ _id: userId });
    await mongoose.disconnect();
  }
});
