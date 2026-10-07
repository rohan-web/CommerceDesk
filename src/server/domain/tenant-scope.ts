import type { BusinessRole } from "../permissions";

export type ScopeIdentity = { userId: string };
export type MembershipScopeData = { _id: unknown; tenantId: unknown; role: BusinessRole; permissions: readonly string[] };
export const membershipScopeProjection = "tenantId role permissions";

export function scopeFromMembership(identity: ScopeIdentity, membership: MembershipScopeData) {
  return Object.freeze({
    tenantId: String(membership.tenantId),
    userId: identity.userId,
    membershipId: String(membership._id),
    role: membership.role,
    permissions: membership.permissions,
  });
}
