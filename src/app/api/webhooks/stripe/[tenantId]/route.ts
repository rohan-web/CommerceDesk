import {createHash} from "node:crypto";
import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {connectDatabase} from "@/server/db";
import {StripeConnection} from "@/server/models/StripeConnection";
import {StripeCheckoutAttempt} from "@/server/models/StripeCheckoutAttempt";
import {StripeWebhookEvent} from "@/server/models/StripeWebhookEvent";
import {Order} from "@/server/models/Order";
import {Payment} from "@/server/models/Payment";
import {AuditEvent} from "@/server/models/AuditEvent";
import {decryptSecret} from "@/server/secrets";
import {verifyStripeWebhookSignature} from "@/server/stripe-signature";
import {applyStripeRefund,finishStripeRefundAttempt} from "@/server/stripe-refunds";
export const dynamic="force-dynamic";
type Context={params:Promise<{tenantId:string}>};
type StripeEvent={id:string;type:string;livemode:boolean;account?:string;data:{object:Record<string,unknown>}};
const maxBodyBytes=1024*1024;
function response(status:number,body:Record<string,unknown>){return NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}})}
async function rawBody(request:Request):Promise<string|null|"too_large">{
 if(!request.body)return null;
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBodyBytes){await reader.cancel();return "too_large"}chunks.push(value)}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}return new TextDecoder("utf-8",{fatal:true}).decode(bytes)}catch{return null}finally{try{reader.releaseLock()}catch{}}
}
function paymentState(captured:number,refunded:number,total:number){if(refunded>=captured&&refunded>0)return"refunded";if(refunded>0)return"partially_refunded";if(captured>=total)return"paid";if(captured>0)return"partially_paid";return"unpaid"}
function text(value:unknown,max=160){return typeof value==="string"&&value.length<=max?value:""}
function integer(value:unknown){return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:null}
export async function POST(request:Request,context:Context){
 const{tenantId}=await context.params;
 if(!mongoose.isValidObjectId(tenantId))return response(404,{error:"Webhook endpoint not found."});
 const signature=request.headers.get("stripe-signature")||"";
 const raw=await rawBody(request);if(raw==="too_large")return response(413,{error:"Webhook body is too large."});if(raw===null)return response(400,{error:"Webhook body is invalid."});
 let event:StripeEvent;try{event=JSON.parse(raw) as StripeEvent}catch{return response(400,{error:"Webhook JSON is invalid."})}
 if(!event||typeof event!=="object"||!/^evt_[A-Za-z0-9]+$/.test(text(event.id,120))||!/^([a-z]+\.)+[a-z_]+$/.test(text(event.type,120))||typeof event.livemode!=="boolean"||!event.data||!event.data.object||typeof event.data.object!=="object")return response(400,{error:"Webhook event is incomplete."});
 try{
  await connectDatabase();
  const integration=await StripeConnection.findOne({tenantId}).select("accountId livemode +webhookSecretEncrypted +apiKeyEncrypted").lean();
  if(!integration)return response(404,{error:"Webhook endpoint not found."});
  let secret:string,configuredLivemode:boolean;try{secret=decryptSecret(integration.webhookSecretEncrypted);configuredLivemode=typeof integration.livemode==="boolean"?integration.livemode:decryptSecret(integration.apiKeyEncrypted).startsWith("sk_live_")}catch{return response(503,{error:"Webhook verification is unavailable."})}
  if(!verifyStripeWebhookSignature(raw,signature,secret))return response(400,{error:"Webhook signature could not be verified."});
  if(event.livemode!==configuredLivemode||(event.account&&event.account!==integration.accountId))return response(400,{error:"Webhook account does not match this endpoint."});
  if(await StripeWebhookEvent.exists({providerEventId:event.id}))return response(200,{received:true,duplicate:true});
  const object=event.data.object,sessionId=text(object.id,120),amountMinor=integer(object.amount_total),currency=text(object.currency,3).toUpperCase(),metadata=(object.metadata&&typeof object.metadata==="object"?object.metadata:{}) as Record<string,unknown>;
  if(event.type==="refund.created"||event.type==="refund.updated"){
   const refundId=text(object.id,120),paymentIntentId=text(object.payment_intent,120),refundAmount=integer(object.amount),refundCurrency=text(object.currency,3).toUpperCase(),refundStatus=text(object.status,40),requestKey=text(metadata.refund_request_key,120),refundTenant=text(metadata.tenant_id,24);
   let status:"processed"|"ignored"|"needs_review"="ignored",failureCode:string|null=null,matchedOrder:mongoose.Types.ObjectId|null=null;
   if(refundTenant&&refundTenant!==tenantId){status="needs_review";failureCode="REFUND_TENANT_MISMATCH"}
   else if(!/^re_[A-Za-z0-9]+$/.test(refundId)||!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)||refundAmount===null||!refundCurrency){status="needs_review";failureCode="REFUND_EVENT_INVALID"}
   else if(refundStatus==="succeeded"){
    const applied=await applyStripeRefund({tenantId,refundId,paymentIntentId,amountMinor:refundAmount,currency:refundCurrency,eventId:event.id,requestKey:requestKey||null});
    status=applied.status;failureCode=applied.failureCode;matchedOrder=applied.orderId&&mongoose.isValidObjectId(applied.orderId)?new mongoose.Types.ObjectId(applied.orderId):null;
   }else if(refundStatus==="pending"){
    if(requestKey)await finishStripeRefundAttempt({tenantId,requestKey,status:"pending",refundId});status="processed";
   }else if(refundStatus==="failed"||refundStatus==="canceled"){
    if(requestKey)await finishStripeRefundAttempt({tenantId,requestKey,status:refundStatus,refundId});status="processed";
   }else{status="needs_review";failureCode="REFUND_STATUS_UNKNOWN"}
   await StripeWebhookEvent.create({tenantId,providerEventId:event.id,providerAccountId:integration.accountId,eventType:event.type,status,receivedAt:new Date(),processedAt:new Date(),failureCode,orderId:matchedOrder,amountMinor:refundAmount,currency:refundCurrency||null});
   await StripeConnection.updateOne({tenantId},{$set:{lastEventAt:new Date(),lastErrorCode:failureCode}});
   if(status==="needs_review")await AuditEvent.create({tenantId,actorId:null,action:"integration.stripe_refund_event_needs_review",entityType:"integration",entityId:event.id,requestId:event.id,metadata:{failureCode,refundId}});
   return response(200,{received:true,status});
  }
  const metadataTenant=text(metadata.tenant_id,24),orderId=text(metadata.order_id,24),attemptId=text(metadata.checkout_attempt_id,24),sessionPaymentStatus=text(object.payment_status,40);
  const accepted=event.type==="checkout.session.completed"||event.type==="checkout.session.async_payment_succeeded";
  const expired=event.type==="checkout.session.expired";
  const failed=event.type==="checkout.session.async_payment_failed";
  const dbSession=await mongoose.startSession();let finalStatus:"processed"|"ignored"|"needs_review"="ignored",failureCode:string|null=null,matchedOrder:mongoose.Types.ObjectId|null=null;
  try{await dbSession.withTransaction(async()=>{
   finalStatus="ignored";failureCode=null;matchedOrder=null;
   if(accepted&&sessionPaymentStatus==="paid"){
    if(metadataTenant!==tenantId||!mongoose.isValidObjectId(orderId)||!mongoose.isValidObjectId(attemptId)||!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)||amountMinor===null||!currency){finalStatus="needs_review";failureCode="CHECKOUT_METADATA_INVALID"}
    else{
     const attempt=await StripeCheckoutAttempt.findOne({_id:attemptId,tenantId,orderId,stripeSessionId:sessionId}).session(dbSession);
     if(!attempt){finalStatus="needs_review";failureCode="CHECKOUT_SESSION_NOT_FOUND"}
     else if(attempt.status==="complete"){finalStatus="ignored";failureCode="SESSION_ALREADY_SETTLED";matchedOrder=attempt.orderId as mongoose.Types.ObjectId}
     else{
      const order=await Order.findOne({_id:orderId,tenantId}).session(dbSession);
      if(!order){finalStatus="needs_review";failureCode="ORDER_NOT_FOUND"}
      else if(!attempt.active||attempt.status!=="open"||attempt.amountMinor!==amountMinor||attempt.currency!==currency||order.status==="cancelled"||order.paymentStatus==="cancelled") {finalStatus="needs_review";failureCode="ORDER_OR_SESSION_MISMATCH";matchedOrder=order._id}
      else{
       const totals=await Payment.aggregate<{direction:string;total:number}>([{$match:{tenantId:order.tenantId,orderId:order._id}},{$group:{_id:"$direction",total:{$sum:"$amountMinor"}}}]).session(dbSession);
       const captured=totals.find(item=>item.direction==="capture")?.total??0,refunded=totals.find(item=>item.direction==="refund")?.total??0,due=order.totalMinor-captured+refunded;
       if(amountMinor>due){finalStatus="needs_review";failureCode="AMOUNT_MISMATCH";matchedOrder=order._id}
       else{
        const paymentIntent=object.payment_intent;
        const reference=typeof paymentIntent==="string"?paymentIntent:"";
        await Payment.create([{tenantId:order.tenantId,orderId:order._id,direction:"capture",method:"stripe",amountMinor,currency,reference,note:"Verified Stripe Checkout payment",idempotencyKey:`stripe_${event.id}`,requestFingerprint:createHash("sha256").update(`${event.id}:${sessionId}:${amountMinor}:${currency}`).digest("hex"),verifiedBy:null,providerEventId:event.id}],{session:dbSession});
        order.paymentStatus=paymentState(captured+amountMinor,refunded,order.totalMinor) as typeof order.paymentStatus;
        if(order.status==="pending_payment")order.status="open";
        await order.save({session:dbSession});
        attempt.status="complete";attempt.active=false;await attempt.save({session:dbSession});
        finalStatus="processed";matchedOrder=order._id;
        await AuditEvent.create([{tenantId:order.tenantId,actorId:null,action:"payment.stripe_checkout_verified",entityType:"payment",entityId:event.id,requestId:event.id,metadata:{orderNumber:order.orderNumber,amountMinor,currency,paymentIntent:reference||null,paymentStatus:order.paymentStatus}}],{session:dbSession});
       }
       if(finalStatus==="needs_review"){attempt.status="complete";attempt.active=false;await attempt.save({session:dbSession})}
      }
     }
    }
   }else if((expired||failed)&&/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)){
    const attempt=await StripeCheckoutAttempt.findOne({tenantId,stripeSessionId:sessionId,active:true}).session(dbSession);
    if(attempt){attempt.status=expired?"expired":"failed";attempt.active=false;await attempt.save({session:dbSession});matchedOrder=attempt.orderId as mongoose.Types.ObjectId;finalStatus="processed"}
   }else if(accepted&&sessionPaymentStatus!=="paid")finalStatus="ignored";
   await StripeWebhookEvent.create([{tenantId,providerEventId:event.id,providerAccountId:integration.accountId,eventType:event.type,status:finalStatus,receivedAt:new Date(),processedAt:new Date(),failureCode,orderId:matchedOrder,amountMinor,currency:currency||null}],{session:dbSession});
   await StripeConnection.updateOne({tenantId},{$set:{lastEventAt:new Date(),lastErrorCode:failureCode}},{session:dbSession});
   if(finalStatus==="needs_review")await AuditEvent.create([{tenantId,actorId:null,action:"integration.stripe_event_needs_review",entityType:"integration",entityId:event.id,requestId:event.id,metadata:{eventType:event.type,orderId:matchedOrder?String(matchedOrder):null,failureCode}}],{session:dbSession});
  })}finally{await dbSession.endSession()}
  return response(200,{received:true,status:finalStatus});
 }catch(error){if((error as {code?:number})?.code===11000&&await StripeWebhookEvent.exists({providerEventId:event.id}))return response(200,{received:true,duplicate:true});return response(500,{error:"Webhook processing could not be completed. Stripe may retry this event."})}
}
