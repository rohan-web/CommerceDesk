import {randomBytes} from "node:crypto";
import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {isSameOrigin} from "@/server/request-security";
import {connectDatabase} from "@/server/db";
import {CustomerPortalAccess} from "@/server/models/CustomerPortalAccess";
import {Customer} from "@/server/models/Customer";
import {Quote} from "@/server/models/Quote";
import {AuditEvent} from "@/server/models/AuditEvent";
import {consumeCustomerPortalLookup} from "@/server/rate-limit";
import {portalHeaders,portalIp,portalTokenHash,resolveCustomerPortal} from "@/server/customer-portal";
export const dynamic="force-dynamic";
type Context={params:Promise<{token:string;quoteId:string}>};
export async function POST(request:Request,context:Context){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403,headers:portalHeaders()});
 try{
  if(await consumeCustomerPortalLookup(portalIp(request))>120)return NextResponse.json({error:"Please try again later."},{status:429,headers:portalHeaders()});
  const {token,quoteId}=await context.params,portal=await resolveCustomerPortal(token);if(!portal)return NextResponse.json({error:"This customer link is invalid or has expired."},{status:404,headers:portalHeaders()});if(!mongoose.isValidObjectId(quoteId))return NextResponse.json({error:"Quote not found."},{status:404,headers:portalHeaders()});
  await connectDatabase();const session=await mongoose.startSession();let result:"accepted"|"unavailable"|"expired"="unavailable";
  try{await session.withTransaction(async()=>{
   const [valid,customer]=await Promise.all([
    CustomerPortalAccess.exists({_id:portal.access._id,tokenHash:portalTokenHash(token),expiresAt:{$gt:new Date()}}).session(session),
    Customer.findOne({_id:portal.customer._id,tenantId:portal.access.tenantId,status:"customer"}).select("name").session(session).lean()
   ]);if(!valid||!customer)throw new Error("PORTAL_REVOKED");
   const quote=await Quote.findOne({_id:quoteId,tenantId:portal.access.tenantId,customerId:portal.customer._id}).session(session);if(!quote)return;
   if(quote.status==="accepted"||quote.status==="converted"){result="accepted";return}
   if(quote.status!=="issued")return;
   if(quote.expiresAt<=new Date()){quote.status="expired";await quote.save({session});result="expired";return}
   quote.status="accepted";quote.acceptedRevision=quote.currentRevision;quote.acceptedAt=new Date();quote.acceptedByName=customer.name;await quote.save({session});
   await AuditEvent.create([{tenantId:portal.access.tenantId,actorId:null,action:"customer.quote_accepted",entityType:"quote",entityId:String(quote._id),requestId:randomBytes(12).toString("hex"),metadata:{quoteNumber:quote.quoteNumber,revision:quote.currentRevision,source:"customer_portal"}}],{session});result="accepted";
  })}finally{await session.endSession()}
  if(result==="unavailable")return NextResponse.json({error:"This quote is unavailable for acceptance."},{status:409,headers:portalHeaders()});if(result==="expired")return NextResponse.json({error:"This quote has expired."},{status:409,headers:portalHeaders()});return NextResponse.json({accepted:true},{headers:portalHeaders()});
 }catch(error){if(error instanceof Error&&error.message==="PORTAL_REVOKED")return NextResponse.json({error:"This customer link is invalid or has expired."},{status:404,headers:portalHeaders()});return NextResponse.json({error:"Quote acceptance could not be recorded."},{status:503,headers:portalHeaders()})}
}
