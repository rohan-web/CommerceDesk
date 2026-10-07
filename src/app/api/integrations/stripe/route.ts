import {randomBytes} from "node:crypto";
import {NextResponse} from "next/server";
import {z} from "zod";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import {requireTenantAccess} from "@/server/tenant-scope";
import {StripeConnection} from "@/server/models/StripeConnection";
import {StripeCheckoutAttempt} from "@/server/models/StripeCheckoutAttempt";
import {StripeRefundAttempt} from "@/server/models/StripeRefundAttempt";
import {AuditEvent} from "@/server/models/AuditEvent";
import {encryptSecret,hasValidEncryptionKey} from "@/server/secrets";
import {StripeApiError,verifyStripeAccountKey} from "@/server/stripe-client";
export const dynamic="force-dynamic";
const schema=z.object({apiKey:z.string().min(20).max(255),webhookSecret:z.string().regex(/^whsec_[A-Za-z0-9_-]{20,}$/)}).strict();
function fail(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"Only workspace owners can manage payment integrations."},{status:403});return NextResponse.json({error:"Payment integration is temporarily unavailable."},{status:503})}
export async function GET(){
 let access;try{access=await requireTenantAccess("tenant:settings")}catch(error){return fail(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 try{const connection=await StripeConnection.findOne({tenantId:access.scope.tenantId}).select("accountId livemode chargesEnabled detailsSubmitted status lastVerifiedAt lastEventAt lastErrorCode updatedAt").lean();return NextResponse.json({connection:connection?{accountId:connection.accountId,livemode:connection.livemode,chargesEnabled:connection.chargesEnabled,detailsSubmitted:connection.detailsSubmitted,status:connection.status,lastVerifiedAt:connection.lastVerifiedAt,lastEventAt:connection.lastEventAt,lastErrorCode:connection.lastErrorCode,updatedAt:connection.updatedAt}:null},{headers:{"Cache-Control":"private, no-store"}})}catch(error){return fail(error)}
}
export async function POST(request:Request){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
 let access;try{access=await requireTenantAccess("tenant:settings")}catch(error){return fail(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 if(await StripeCheckoutAttempt.exists({tenantId:access.scope.tenantId,active:true,status:{$in:["creating","open"]},expiresAt:{$gt:new Date()}}))return NextResponse.json({error:"Wait for active Stripe checkout sessions to expire before replacing credentials."},{status:409});
 if(await StripeRefundAttempt.exists({tenantId:access.scope.tenantId,active:true}))return NextResponse.json({error:"Wait for active Stripe refunds to finish before replacing credentials."},{status:409});
 if(!hasValidEncryptionKey())return NextResponse.json({error:"Set a valid APP_ENCRYPTION_KEY before saving payment credentials."},{status:503});
 const limited=await readJsonLimited(request,4096);if(limited.kind!=="ok")return NextResponse.json({error:limited.kind==="too-large"?"Request is too large.":"Request body is invalid."},{status:limited.kind==="too-large"?413:400});
 const parsed=schema.safeParse(limited.value);if(!parsed.success)return NextResponse.json({error:"Provide a Stripe secret key and webhook signing secret."},{status:400});
 try{
  const account=await verifyStripeAccountKey(parsed.data.apiKey);
  const previous=await StripeConnection.findOne({tenantId:access.scope.tenantId}).select("accountId").lean(),now=new Date(),status=account.chargesEnabled?"connected":"degraded";
  const fields={accountId:account.accountId,apiKeyEncrypted:encryptSecret(parsed.data.apiKey),webhookSecretEncrypted:encryptSecret(parsed.data.webhookSecret),livemode:account.livemode,chargesEnabled:account.chargesEnabled,detailsSubmitted:account.detailsSubmitted,status,lastVerifiedAt:now,lastErrorCode:null};
  await StripeConnection.findOneAndUpdate({tenantId:access.scope.tenantId},{$set:fields,$setOnInsert:{tenantId:access.scope.tenantId}},{upsert:true,new:true,runValidators:true});
  await AuditEvent.create({tenantId:access.scope.tenantId,actorId:access.scope.userId,action:"integration.stripe_connected",entityType:"integration",entityId:"stripe",requestId:randomBytes(12).toString("hex"),metadata:{accountId:account.accountId,accountChanged:Boolean(previous&&previous.accountId!==account.accountId),livemode:account.livemode,chargesEnabled:account.chargesEnabled,detailsSubmitted:account.detailsSubmitted}});
  return NextResponse.json({connection:{accountId:account.accountId,chargesEnabled:account.chargesEnabled,detailsSubmitted:account.detailsSubmitted,status,lastVerifiedAt:now,livemode:account.livemode}},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){if(error instanceof StripeApiError)return NextResponse.json({error:error.message},{status:error.status});return fail(error)}
}
export async function DELETE(request:Request){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
 let access;try{access=await requireTenantAccess("tenant:settings")}catch(error){return fail(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 try{if(await StripeCheckoutAttempt.exists({tenantId:access.scope.tenantId,active:true,status:{$in:["creating","open"]},expiresAt:{$gt:new Date()}}))return NextResponse.json({error:"Wait for active Stripe checkout sessions to expire before disconnecting."},{status:409});if(await StripeRefundAttempt.exists({tenantId:access.scope.tenantId,active:true}))return NextResponse.json({error:"Wait for active Stripe refunds to finish before disconnecting."},{status:409});const prior=await StripeConnection.findOneAndDelete({tenantId:access.scope.tenantId}).select("accountId").lean();if(prior)await AuditEvent.create({tenantId:access.scope.tenantId,actorId:access.scope.userId,action:"integration.stripe_disconnected",entityType:"integration",entityId:"stripe",requestId:randomBytes(12).toString("hex"),metadata:{accountId:prior.accountId}});return NextResponse.json({disconnected:true},{headers:{"Cache-Control":"private, no-store"}})}catch(error){return fail(error)}
}
