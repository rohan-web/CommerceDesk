import {createHash} from "node:crypto";
import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {z} from "zod";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import {requireTenantAccess} from "@/server/tenant-scope";
import {Order} from "@/server/models/Order";
import {Payment} from "@/server/models/Payment";
import {AuditEvent} from "@/server/models/AuditEvent";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
const schema=z.object({direction:z.enum(["capture","refund"]),method:z.enum(["cash","bank_transfer","other"]),amountMinor:z.number().int().safe().min(1).max(Number.MAX_SAFE_INTEGER),reference:z.string().trim().max(120).default(""),note:z.string().trim().max(500).default("")}).strict();
function fail(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"You do not have permission to record payments."},{status:403});return NextResponse.json({error:"Payment service is temporarily unavailable."},{status:503})}
function paymentState(captured:number,refunded:number,total:number){if(refunded>=captured&&refunded>0)return "refunded";if(refunded>0)return "partially_refunded";if(captured>=total)return "paid";if(captured>0)return "partially_paid";return "unpaid"}
function validKey(key:string|null):key is string{return Boolean(key&&key.length<=120&&/^[A-Za-z0-9._:-]+$/.test(key))}
export async function GET(_request:Request,context:Context){
 let access;try{access=await requireTenantAccess("payments:read")}catch(error){return fail(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 const{id}=await context.params;if(!mongoose.isValidObjectId(id))return NextResponse.json({error:"Order not found."},{status:404});
 try{const order=await Order.findOne({_id:id,tenantId:access.scope.tenantId}).select("_id currency totalMinor paymentStatus").lean();if(!order)return NextResponse.json({error:"Order not found."},{status:404});const entries=await Payment.find({tenantId:access.scope.tenantId,orderId:id}).sort({createdAt:1,_id:1}).populate({path:"verifiedBy",select:"name"}).lean();return NextResponse.json({entries,order},{headers:{"Cache-Control":"private, no-store"}})}catch(error){return fail(error)}
}
export async function POST(request:Request,context:Context){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});

 const body=await readJsonLimited(request,12000);if(body.kind==="too-large")return NextResponse.json({error:"Request is too large."},{status:413});const parsed=schema.safeParse(body.kind==="ok"?body.value:null);if(!parsed.success)return NextResponse.json({error:"Review the payment amount and details.",issues:parsed.error.issues.map(issue=>({field:issue.path.join("."),message:issue.message}))},{status:400});
 let access;try{access=await requireTenantAccess(parsed.data.direction==="refund"?"refunds:approve":"payments:verify")}catch(error){return fail(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 const key=request.headers.get("idempotency-key")?.trim()??null;if(!validKey(key))return NextResponse.json({error:"Supply a stable Idempotency-Key for this ledger entry."},{status:400});
 const{id}=await context.params;if(!mongoose.isValidObjectId(id))return NextResponse.json({error:"Order not found."},{status:404});
 const fingerprint=createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex");
 const prior=await Payment.findOne({tenantId:access.scope.tenantId,idempotencyKey:key}).select("+requestFingerprint").lean().catch(()=>null);if(prior){if(prior.requestFingerprint!==fingerprint||String(prior.orderId)!==id)return NextResponse.json({error:"This Idempotency-Key was already used for a different ledger entry."},{status:409});return NextResponse.json({entry:prior,replayed:true},{headers:{"Cache-Control":"private, no-store"}})}
 const session=await mongoose.startSession();let result:unknown,replayed=false;
 try{await session.withTransaction(async()=>{
  const order=await Order.findOne({_id:id,tenantId:access.scope.tenantId}).select("+stripeRefundsPendingMinor").session(session);if(!order)throw new Error("ORDER_NOT_FOUND");
  if(parsed.data.direction==="refund"&&(order.stripeRefundsPendingMinor??0)>0)throw new Error("REFUND_IN_PROGRESS");
  if(parsed.data.direction==="capture"&&order.status==="cancelled")throw new Error("ORDER_CANCELLED");
  const [captured,refunded]=await Promise.all([
   Payment.aggregate<{total:number}>([{$match:{tenantId:order.tenantId,orderId:order._id,direction:"capture"}},{$group:{_id:null,total:{$sum:"$amountMinor"}}}]).session(session),
   Payment.aggregate<{total:number}>([{$match:{tenantId:order.tenantId,orderId:order._id,direction:"refund"}},{$group:{_id:null,total:{$sum:"$amountMinor"}}}]).session(session)
  ]);
  const capturedMinor=captured[0]?.total??0,refundedMinor=refunded[0]?.total??0;
  if(parsed.data.direction==="capture"&&parsed.data.amountMinor>order.totalMinor-capturedMinor)throw new Error("CAPTURE_EXCEEDS_BALANCE");
  if(parsed.data.direction==="refund"&&parsed.data.amountMinor>capturedMinor-refundedMinor)throw new Error("REFUND_EXCEEDS_CAPTURED");
  const[entry]=await Payment.create([{tenantId:order.tenantId,orderId:order._id,direction:parsed.data.direction,method:parsed.data.method,amountMinor:parsed.data.amountMinor,currency:order.currency,reference:parsed.data.reference,note:parsed.data.note,idempotencyKey:key,requestFingerprint:fingerprint,verifiedBy:access.scope.userId}],{session});
  const nextCaptured=capturedMinor+(parsed.data.direction==="capture"?parsed.data.amountMinor:0),nextRefunded=refundedMinor+(parsed.data.direction==="refund"?parsed.data.amountMinor:0);
  order.paymentStatus=paymentState(nextCaptured,nextRefunded,order.totalMinor) as typeof order.paymentStatus;if(parsed.data.direction==="capture"&&order.status==="pending_payment")order.status="open";await order.save({session});
  await AuditEvent.create([{tenantId:order.tenantId,actorId:access.scope.userId,action:parsed.data.direction==="capture"?"payment.manual_capture_verified":"payment.manual_refund_verified",entityType:"payment",entityId:String(entry._id),requestId:key,metadata:{orderId:String(order._id),orderNumber:order.orderNumber,amountMinor:entry.amountMinor,currency:entry.currency,method:entry.method,reference:entry.reference,paymentStatus:order.paymentStatus}}],{session});
  result={entry:entry.toObject(),paymentStatus:order.paymentStatus};
 })}catch(error){
  if(error instanceof Error&&error.message==="ORDER_NOT_FOUND")return NextResponse.json({error:"Order not found."},{status:404});
  if(error instanceof Error&&error.message==="ORDER_CANCELLED")return NextResponse.json({error:"A cancelled order cannot receive a payment."},{status:409});
  if(error instanceof Error&&error.message==="CAPTURE_EXCEEDS_BALANCE")return NextResponse.json({error:"The payment exceeds the order's remaining balance."},{status:409});
  if(error instanceof Error&&error.message==="REFUND_EXCEEDS_CAPTURED")return NextResponse.json({error:"A refund cannot exceed the verified, unrefunded amount."},{status:409});
  if(error instanceof Error&&error.message==="REFUND_IN_PROGRESS")return NextResponse.json({error:"A Stripe refund is still being processed for this order. Wait for its result before recording another refund."},{status:409});
  if((error as {code?:number})?.code===11000){const entry=await Payment.findOne({tenantId:access.scope.tenantId,idempotencyKey:key}).select("+requestFingerprint").lean();if(entry&&entry.requestFingerprint===fingerprint&&String(entry.orderId)===id)return NextResponse.json({entry,replayed:true},{headers:{"Cache-Control":"private, no-store"}});return NextResponse.json({error:"This Idempotency-Key is already in use."},{status:409})}
  return fail(error);
 }finally{await session.endSession()}
 return NextResponse.json({...(result as object),replayed},{status:201,headers:{"Cache-Control":"private, no-store"}});
}

