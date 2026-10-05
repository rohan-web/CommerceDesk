import {randomBytes} from "node:crypto";
import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import {connectDatabase} from "@/server/db";
import {CustomerPortalAccess} from "@/server/models/CustomerPortalAccess";
import {SupportCase} from "@/server/models/SupportCase";
import {SupportEvent} from "@/server/models/SupportEvent";
import {AuditEvent} from "@/server/models/AuditEvent";
import {consumeCustomerPortalLookup} from "@/server/rate-limit";
import {portalHeaders,portalIp,portalTokenHash,resolveCustomerPortal} from "@/server/customer-portal";
export const dynamic="force-dynamic";
type Context={params:Promise<{token:string;caseId:string}>};
export async function POST(request:Request,context:Context){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403,headers:portalHeaders()});
 try{
  if(await consumeCustomerPortalLookup(portalIp(request))>120)return NextResponse.json({error:"Please try again later."},{status:429,headers:portalHeaders()});
  const {token,caseId}=await context.params,portal=await resolveCustomerPortal(token);if(!portal)return NextResponse.json({error:"This customer link is invalid or has expired."},{status:404,headers:portalHeaders()});if(!mongoose.isValidObjectId(caseId))return NextResponse.json({error:"Case not found."},{status:404,headers:portalHeaders()});
  const parsed=await readJsonLimited(request,4096),body=parsed.kind==="ok"?parsed.value:null;const message=body&&typeof body==="object"&&typeof (body as {message?:unknown}).message==="string"?(body as {message:string}).message.trim():"";if(message.length<2||message.length>2000)return NextResponse.json({error:parsed.kind==="too-large"?"Reply is too large.":"Reply must be 2-2,000 characters."},{status:400,headers:portalHeaders()});
  await connectDatabase();const session=await mongoose.startSession();let missing=false;
  try{await session.withTransaction(async()=>{
   const valid=await CustomerPortalAccess.exists({_id:portal.access._id,tokenHash:portalTokenHash(token),expiresAt:{$gt:new Date()}}).session(session);if(!valid)throw new Error("PORTAL_REVOKED");
   const supportCase=await SupportCase.findOne({_id:caseId,tenantId:portal.access.tenantId,customerId:portal.customer._id,status:{$nin:["closed","resolved"]}}).session(session);if(!supportCase){missing=true;return}
   await SupportEvent.create([{tenantId:portal.access.tenantId,caseId:supportCase._id,actorId:null,action:"customer_reply",visibility:"customer",body:message}],{session});
   if(supportCase.status==="awaiting_customer")supportCase.status="awaiting_internal";await supportCase.save({session});
   await AuditEvent.create([{tenantId:portal.access.tenantId,actorId:null,action:"customer.support_case_replied",entityType:"support_case",entityId:String(supportCase._id),requestId:randomBytes(12).toString("hex"),metadata:{}}],{session});
  })}finally{await session.endSession()}
  if(missing)return NextResponse.json({error:"This case is closed or unavailable."},{status:404,headers:portalHeaders()});return NextResponse.json({sent:true},{headers:portalHeaders()});
 }catch(error){if(error instanceof Error&&error.message==="PORTAL_REVOKED")return NextResponse.json({error:"This customer link is invalid or has expired."},{status:404,headers:portalHeaders()});return NextResponse.json({error:"Your reply could not be sent."},{status:503,headers:portalHeaders()})}
}
