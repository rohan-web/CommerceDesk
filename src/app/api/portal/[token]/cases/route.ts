import {randomBytes} from "node:crypto";
import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import {connectDatabase} from "@/server/db";
import {CustomerPortalAccess} from "@/server/models/CustomerPortalAccess";
import {SupportCase} from "@/server/models/SupportCase";
import {SupportEvent} from "@/server/models/SupportEvent";
import {Order} from "@/server/models/Order";
import {AuditEvent} from "@/server/models/AuditEvent";
import {consumeCustomerPortalLookup} from "@/server/rate-limit";
import {portalHeaders,portalIp,portalTokenHash,resolveCustomerPortal} from "@/server/customer-portal";
export const dynamic="force-dynamic";
type Context={params:Promise<{token:string}>};
export async function POST(request:Request,context:Context){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403,headers:portalHeaders()});
 try{
  if(await consumeCustomerPortalLookup(portalIp(request))>120)return NextResponse.json({error:"Please try again later."},{status:429,headers:portalHeaders()});
  const {token}=await context.params,portal=await resolveCustomerPortal(token);if(!portal)return NextResponse.json({error:"This customer link is invalid or has expired."},{status:404,headers:portalHeaders()});
  const parsed=await readJsonLimited(request,4096),body=parsed.kind==="ok"?parsed.value:null;if(!body||typeof body!="object"||!(["question","delivery","return","damaged","other"] as unknown[]).includes((body as {kind?:unknown}).kind)||typeof (body as {subject?:unknown}).subject!=="string"||typeof (body as {message?:unknown}).message!=="string")return NextResponse.json({error:parsed.kind==="too-large"?"Message is too large.":"Add a subject, message, and case type."},{status:400,headers:portalHeaders()});
  const subject=(body as {subject:string}).subject.trim(),message=(body as {message:string}).message.trim(),kind=(body as {kind:string}).kind,orderId=(body as {orderId?:unknown}).orderId;
  if(subject.length<3||subject.length>180||message.length<3||message.length>2000)return NextResponse.json({error:"Subject must be 3–180 characters and message 3–2,000 characters."},{status:400,headers:portalHeaders()});
  if(orderId!=null&&(!mongoose.isValidObjectId(orderId)||!await Order.exists({_id:orderId,tenantId:portal.access.tenantId,customerId:portal.customer._id})))return NextResponse.json({error:"That order is not available in this portal."},{status:404,headers:portalHeaders()});
  await connectDatabase();const session=await mongoose.startSession();let created:any=null;
  try{await session.withTransaction(async()=>{
   const valid=await CustomerPortalAccess.exists({_id:portal.access._id,tokenHash:portalTokenHash(token),expiresAt:{$gt:new Date()}}).session(session);if(!valid)throw new Error("PORTAL_REVOKED");
   const [record]=await SupportCase.create([{tenantId:portal.access.tenantId,customerId:portal.customer._id,orderId:orderId||null,kind,subject,status:"open",createdBy:null,updatedBy:null}],{session});created=record;
   await SupportEvent.create([{tenantId:portal.access.tenantId,caseId:record._id,actorId:null,action:"created",visibility:"customer",body:message}],{session});
   await AuditEvent.create([{tenantId:portal.access.tenantId,actorId:null,action:"customer.support_case_created",entityType:"support_case",entityId:String(record._id),requestId:randomBytes(12).toString("hex"),metadata:{kind,orderId:orderId?String(orderId):null}}],{session});
  })}finally{await session.endSession()}
  return NextResponse.json({case:{_id:String(created._id),kind:created.kind,subject:created.subject,status:created.status,createdAt:created.createdAt,events:[{action:"created",body:message,createdAt:new Date()}]}},{status:201,headers:portalHeaders()});
 }catch(error){if(error instanceof Error&&error.message==="PORTAL_REVOKED")return NextResponse.json({error:"This customer link is invalid or has expired."},{status:404,headers:portalHeaders()});return NextResponse.json({error:"Your support request could not be saved."},{status:503,headers:portalHeaders()})}
}
