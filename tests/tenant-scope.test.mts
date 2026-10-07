import assert from "node:assert/strict";
import test from "node:test";
import { membershipScopeProjection, scopeFromMembership } from "../src/server/domain/tenant-scope.ts";

test("membership projection includes the tenant key and returns a fully scoped identity", () => {
  assert.ok(membershipScopeProjection.split(/\s+/).includes("tenantId"));
  assert.deepEqual(scopeFromMembership({ userId: "user-1" }, {
    _id: "membership-1", tenantId: "tenant-1", role: "owner", permissions: [],
  }), { tenantId: "tenant-1", userId: "user-1", membershipId: "membership-1", role: "owner", permissions: [] });
});
