import {NextResponse} from "next/server";
import {connectDatabase} from "@/server/db";
import {Appointment} from "@/server/models/Appointment";
import {Order} from "@/server/models/Order";
import {Quote} from "@/server/models/Quote";
import {QuoteRevision} from "@/server/models/QuoteRevision";
import {SupportCase} from "@/server/models/SupportCase";
import {SupportEvent} from "@/server/models/SupportEvent";
import {consumeCustomerPortalLookup} from "@/server/rate-limit";
import {portalHeaders,portalIp,resolveCustomerPortal} from "@/server/customer-portal";
export const dynamic="force-dynamic";
type Context={params:Promise<{token:string}>};
export async function GET(request:Request,context:Context){
 try{
  if(await consumeCustomerPortalLookup(portalIp(request))>120)return NextResponse.json({error:"Please try again later."},{status:429,headers:portalHeaders()});
  const {token}=await context.params,portal=await resolveCustomerPortal(token);
  if(!portal)return NextResponse.json({error:"This customer link is invalid or has expired."},{status:404,headers:portalHeaders()});
  const {tenantId}=portal.access,customerId=portal.customer._id;
  await connectDatabase();
  const [orders,quotes,appointments,cases]=await Promise.all([
   Order.find({tenantId,customerId}).sort({createdAt:-1}).limit(100).select("orderNumber lines.name lines.quantity lines.grossMinor currency subtotalMinor taxMinor shippingFeeMinor totalMinor status paymentStatus fulfilmentStatus createdAt").lean(),
   Quote.find({tenantId,customerId,status:{$in:["issued","accepted","declined","converted"]}}).sort({updatedAt:-1}).limit(100).select("quoteNumber status currentRevision acceptedRevision acceptedAt expiresAt convertedAt createdAt updatedAt").lean(),
   Appointment.find({tenantId,customerId}).sort({startsAt:-1}).limit(100).select("serviceName serviceDurationMinutes resourceName startsAt endsAt businessTimezone status cancellationPolicyHours manageTokenHash manageTokenExpiresAt").lean(),
   SupportCase.find({tenantId,customerId}).sort({updatedAt:-1}).limit(100).select("kind subject status orderId createdAt updatedAt").lean()
  ]);
  const quoteRevisions=await QuoteRevision.find({tenantId,$or:quotes.map(q=>({quoteId:q._id,revision:q.currentRevision}))}).select("quoteId revision lines.name lines.quantity lines.grossMinor currency subtotalMinor taxMinor totalMinor terms expiresAt").lean();
  const caseIds=cases.map(c=>c._id),events=caseIds.length?await SupportEvent.find({tenantId,caseId:{$in:caseIds},visibility:"customer"}).sort({createdAt:1}).select("caseId action body createdAt").lean():[];
  const revisions=new Map(quoteRevisions.map(r=>[`${r.quoteId}:${r.revision}`,r]));
  const {CustomerPortalAccess}=await import("@/server/models/CustomerPortalAccess");await CustomerPortalAccess.updateOne({_id:portal.access._id,tokenHash:{$exists:true}},{$set:{lastAccessAt:new Date()}});
  return NextResponse.json({customer:portal.customer,tenant:portal.tenant,orders,quotes:quotes.map(q=>({...q,revision:revisions.get(`${q._id}:${q.currentRevision}`)||null})),appointments,cases:cases.map(c=>({...c,events:events.filter(e=>String(e.caseId)===String(c._id))}))},{headers:portalHeaders()});
 }catch{return NextResponse.json({error:"Customer portal is temporarily unavailable."},{status:503,headers:portalHeaders()})}
}
