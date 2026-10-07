import { connectDatabase } from "./db";
import { Membership } from "./models/Membership";
import type { BusinessRole,Action } from "./permissions";
import {assertPermission} from "./permissions";
import {readSession} from "./auth";
import {Tenant} from "./models/Tenant";
import {membershipScopeProjection,scopeFromMembership} from "./domain/tenant-scope";
/** Identity must come from a verified server session. Tenant membership is re-read so revocation takes effect. */
export async function resolveTenantScope(identity:{userId:string},tenantId:string) {
 await connectDatabase();
 const membership=await Membership.findOne({tenantId,userId:identity.userId,revokedAt:null}).select(membershipScopeProjection).lean();
 if(!membership)throw new Error("TENANT_MEMBERSHIP_REQUIRED");
 return scopeFromMembership(identity,{...membership,role:membership.role as BusinessRole,permissions:membership.permissions??[]});
}

/** Resolves tenant identity exclusively from a live server session and current membership. */
export async function requireTenantAccess(action:Action){
 const identity=await readSession();if(!identity)return null;
 const scope=await resolveTenantScope(identity,identity.tenantId);assertPermission(scope,action);
 const tenant=await Tenant.findById(scope.tenantId).select("name commerceMode baseCurrency timezone quoteDiscountApprovalThresholdBps").lean();
 if(!tenant)throw new Error("TENANT_NOT_FOUND");
 return {scope,tenant};
}
