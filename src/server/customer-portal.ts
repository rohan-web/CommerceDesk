import {createHash} from "node:crypto";
import mongoose from "mongoose";
import {connectDatabase} from "@/server/db";
import {CustomerPortalAccess} from "@/server/models/CustomerPortalAccess";
import {Customer} from "@/server/models/Customer";
import {Tenant} from "@/server/models/Tenant";

export function portalTokenHash(token:string){return createHash("sha256").update(token).digest("hex")}
export function validPortalToken(token:string){return /^[A-Za-z0-9_-]{43}$/.test(token)}
export async function resolveCustomerPortal(token:string){
 if(!validPortalToken(token))return null;
 await connectDatabase();
 const access=await CustomerPortalAccess.findOne({tokenHash:portalTokenHash(token),expiresAt:{$gt:new Date()}}).select("tenantId customerId expiresAt").lean();
 if(!access)return null;
 const [customer,tenant]=await Promise.all([
  Customer.findOne({_id:access.customerId,tenantId:access.tenantId,status:"customer"}).select("_id name email company").lean(),
  Tenant.findById(access.tenantId).select("name baseCurrency timezone").lean()
 ]);
 if(!customer||!tenant)return null;
 return {access,customer,tenant};
}
export function portalIp(request:Request){return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||request.headers.get("x-real-ip")||"unknown"}
export function portalHeaders(){return {"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow"}}
