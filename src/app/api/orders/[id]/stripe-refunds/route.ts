import {createHash} from "node:crypto";
import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {z} from "zod";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import {requireTenantAccess} from "@/server/tenant-scope";
import {Order} from "@/server/models/Order";
import {Payment} from "@/server/models/Payment";
import {StripeConnection} from "@/server/models/StripeConnection";
import {StripeRefundAttempt} from "@/server/models/StripeRefundAttempt";
import {AuditEvent} from "@/server/models/AuditEvent";
import {remainingRefundableMinor} from "@/server/domain/payment-balance";
import {createStripeRefund,StripeApiError} from "@/server/stripe-client";
import {decryptSecret} from "@/server/secrets";
import {applyStripeRefund,finishStripeRefundAttempt} from "@/server/stripe-refunds";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
const schema=z.object({paymentId:z.string().regex(/^[a-f\d]{24}$/i),amountMinor:z.number().int().safe().min(1).max(Number.MAX_SAFE_INTEGER),note:z.string().trim().max(500).default("")}).strict();
function response(status:number,body:Record<string,unknown>){return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}})}
function validKey(key:string|null):key is string{return Boolean(key&&key.length<=120&&/^[A-Za-z0-9._:-]+$/.test(key))}
function fail(){return response(503,{error:"Stripe refund could not be completed. Retry with the same request key."})}
export async function POST(request:Request,context:Context){
 if(!isSameOrigin(request))return response(403,{error:"Request origin could not be verified."});
 const body=await readJsonLimited(request,4096);if(body.kind==="too-large")return response(413,{error:"Request is too large."});
 const parsed=schema.safeParse(body.kind==="ok"?body.value:null);if(!parsed.success)return response(400,{error:"Provide a Stripe payment and valid refund amount."});
 let access;try{access=await requireTenantAccess("refunds:approve")}catch(error){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return response(403,{error:"You do not have permission to approve refunds."});return fail()}
 if(!access)return response(401,{error:"Sign in is required."});
 const key=request.headers.get("idempotency-key")?.trim()??null;if(!validKey(key))return response(400,{error:"Supply a stable Idempotency-Key for this refund request."});
 const{id}=await context.params;if(!mongoose.isValidObjectId(id))return response(404,{error:"Order not found."});
 const fingerprint=createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex");
 try{
  const connection=await StripeConnection.findOne({tenantId:access.scope.tenantId,status:"connected"}).select("+apiKeyEncrypted").lean();if(!connection)return response(409,{error:"Stripe is disconnected. Reconnect it before refunding this payment."});
  let attempt=await StripeRefundAttempt.findOne({tenantId:access.scope.tenantId,idempotencyKey:key}).select("+requestFingerprint").lean();
  if(attempt){
   if(attempt.requestFingerprint!==fingerprint||String(attempt.orderId)!==id)return response(409,{error:"This Idempotency-Key was already used for a different refund."});
   if(attempt.status==="succeeded"){const entry=await Payment.findOne({tenantId:access.scope.tenantId,method:"stripe",direction:"refund",reference:attempt.stripeRefundId}).lean();return response(200,{status:"succeeded",entry,replayed:true})}
   if(attempt.status==="pending")return response(202,{status:"pending",refundId:attempt.stripeRefundId,replayed:true});
   if(attempt.status!=="creating")return response(409,{error:"Stripe did not complete this refund. Review the payment and start a new request."});
  }else{
   const session=await mongoose.startSession();try{await session.withTransaction(async()=>{
    const order=await Order.findOne({_id:id,tenantId:access.scope.tenantId}).select("_id currency +stripeRefundsPendingMinor").session(session);if(!order)throw new Error("ORDER_NOT_FOUND");
    const capture=await Payment.findOne({_id:parsed.data.paymentId,tenantId:order.tenantId,orderId:order._id,direction:"capture",method:"stripe"}).session(session);if(!capture||!/^pi_[A-Za-z0-9]+$/.test(capture.reference))throw new Error("STRIPE_CAPTURE_NOT_FOUND");
    const totals=await Payment.aggregate<{direction:string;total:number}>([{$match:{tenantId:order.tenantId,orderId:order._id}},{$group:{_id:"$direction",total:{$sum:"$amountMinor"}}}]).session(session);
    const captured=totals.find(item=>item.direction==="capture")?.total??0,refunded=totals.find(item=>item.direction==="refund")?.total??0,pending=order.stripeRefundsPendingMinor??0;
    if(parsed.data.amountMinor>remainingRefundableMinor(captured,refunded,pending))throw new Error("REFUND_EXCEEDS_ORDER_BALANCE");
    const againstCapture=await Payment.aggregate<{total:number}>([{$match:{tenantId:order.tenantId,orderId:order._id,direction:"refund",sourcePaymentId:capture._id}},{$group:{_id:null,total:{$sum:"$amountMinor"}}}]).session(session);
    if(parsed.data.amountMinor>capture.amountMinor-(againstCapture[0]?.total??0))throw new Error("REFUND_EXCEEDS_PAYMENT_BALANCE");
    order.stripeRefundsPendingMinor=pending+parsed.data.amountMinor;await order.save({session});
    const[created]=await StripeRefundAttempt.create([{tenantId:order.tenantId,orderId:order._id,sourcePaymentId:capture._id,idempotencyKey:key,requestFingerprint:fingerprint,paymentIntentId:capture.reference,amountMinor:parsed.data.amountMinor,currency:capture.currency,note:parsed.data.note,status:"creating",active:true}],{session});
    attempt=created.toObject();
   })}finally{await session.endSession()}
  }
  if(!attempt)return response(503,{error:"The refund request could not be prepared. Retry with the same request key."});
  const source=await Payment.findOne({_id:attempt.sourcePaymentId,tenantId:attempt.tenantId,orderId:attempt.orderId,direction:"capture",method:"stripe"}).lean();if(!source)return response(409,{error:"The original Stripe payment could not be found."});
  let stripeRefund;
  try{stripeRefund=await createStripeRefund({apiKey:decryptSecret(connection.apiKeyEncrypted),idempotencyKey:`stripe_refund_${createHash("sha256").update(attempt.idempotencyKey).digest("hex")}`,paymentIntentId:attempt.paymentIntentId,amountMinor:attempt.amountMinor,currency:attempt.currency,metadata:{tenant_id:String(attempt.tenantId),order_id:String(attempt.orderId),payment_id:String(attempt.sourcePaymentId),refund_request_key:attempt.idempotencyKey}})}
  catch(error){if(error instanceof StripeApiError&&error.status<500){await finishStripeRefundAttempt({tenantId:String(attempt.tenantId),requestKey:attempt.idempotencyKey,status:"failed",refundId:null});return response(error.status,{error:error.message})}if(error instanceof StripeApiError)return response(error.status,{error:error.message});return fail()}
  if(stripeRefund.status==="succeeded"){
   const applied=await applyStripeRefund({tenantId:String(attempt.tenantId),refundId:stripeRefund.id,paymentIntentId:stripeRefund.paymentIntentId,amountMinor:stripeRefund.amountMinor,currency:stripeRefund.currency,requestKey:attempt.idempotencyKey});
   const entry=await Payment.findOne({tenantId:attempt.tenantId,direction:"refund",method:"stripe",reference:stripeRefund.id}).lean();
   if(applied.status==="needs_review")return response(202,{status:"needs_review",refundId:stripeRefund.id,error:"Stripe completed the refund, but it needs ledger review."});
   await AuditEvent.create({tenantId:attempt.tenantId,actorId:access.scope.userId,action:"payment.stripe_refund_requested",entityType:"payment",entityId:stripeRefund.id,requestId:attempt.idempotencyKey,metadata:{orderId:String(attempt.orderId),sourcePaymentId:String(source._id),amountMinor:attempt.amountMinor,currency:attempt.currency}});
   return response(201,{status:"succeeded",refundId:stripeRefund.id,entry});
  }
  if(stripeRefund.status==="pending"){
   await finishStripeRefundAttempt({tenantId:String(attempt.tenantId),requestKey:attempt.idempotencyKey,status:"pending",refundId:stripeRefund.id});
   return response(202,{status:"pending",refundId:stripeRefund.id});
  }
  await finishStripeRefundAttempt({tenantId:String(attempt.tenantId),requestKey:attempt.idempotencyKey,status:stripeRefund.status,refundId:stripeRefund.id});
  return response(409,{status:stripeRefund.status,error:"Stripe did not complete the refund. Review its status before retrying."});
 }catch(error){
  if(error instanceof Error&&error.message==="ORDER_NOT_FOUND")return response(404,{error:"Order not found."});
  if(error instanceof Error&&error.message==="STRIPE_CAPTURE_NOT_FOUND")return response(404,{error:"A refundable Stripe capture could not be found."});
  if(error instanceof Error&&error.message==="REFUND_EXCEEDS_ORDER_BALANCE")return response(409,{error:"The refund exceeds the remaining captured order balance."});
  if(error instanceof Error&&error.message==="REFUND_EXCEEDS_PAYMENT_BALANCE")return response(409,{error:"The refund exceeds the selected Stripe payment's remaining balance."});
  if((error as {code?:number})?.code===11000)return response(409,{error:"Another refund for this order is already being processed, or this request key is already in use."});
  return fail();
 }
}
