import {createHash} from "node:crypto";
import mongoose from "mongoose";
import {Order} from "./models/Order";
import {Payment} from "./models/Payment";
import {StripeRefundAttempt} from "./models/StripeRefundAttempt";
import {AuditEvent} from "./models/AuditEvent";
import {paymentStatusFromLedger,remainingRefundableMinor} from "./domain/payment-balance";

export type ProviderRefundResult={status:"processed"|"needs_review";orderId:string|null;failureCode:string|null};
type RefundData={tenantId:string;refundId:string;paymentIntentId:string;amountMinor:number;currency:string;eventId?:string|null;requestKey?:string|null};

/** Posts an authoritative Stripe refund once and releases its in-flight balance reservation atomically. */
export async function applyStripeRefund(data:RefundData):Promise<ProviderRefundResult>{
 if(!/^re_[A-Za-z0-9]+$/.test(data.refundId)||!/^pi_[A-Za-z0-9]+$/.test(data.paymentIntentId)||!Number.isSafeInteger(data.amountMinor)||data.amountMinor<1||!/^[A-Z]{3}$/.test(data.currency))return{status:"needs_review",orderId:null,failureCode:"REFUND_EVENT_INVALID"};
 const session=await mongoose.startSession();let result:ProviderRefundResult={status:"needs_review",orderId:null,failureCode:"REFUND_EVENT_UNMATCHED"};
 try{await session.withTransaction(async()=>{
  result={status:"needs_review",orderId:null,failureCode:"REFUND_EVENT_UNMATCHED"};
  const prior=await Payment.findOne({tenantId:data.tenantId,direction:"refund",method:"stripe",reference:data.refundId}).session(session);
  const attempt=data.requestKey?await StripeRefundAttempt.findOne({tenantId:data.tenantId,idempotencyKey:data.requestKey}).session(session):await StripeRefundAttempt.findOne({tenantId:data.tenantId,stripeRefundId:data.refundId}).session(session);
  if(prior){
   if(attempt?.active){const order=await Order.findOne({_id:attempt.orderId,tenantId:data.tenantId}).select("+stripeRefundsPendingMinor").session(session);if(order){order.stripeRefundsPendingMinor=Math.max(0,(order.stripeRefundsPendingMinor??0)-attempt.amountMinor);await order.save({session})}attempt.status="succeeded";attempt.active=false;attempt.stripeRefundId=data.refundId;await attempt.save({session})}
   result={status:"processed",orderId:String(prior.orderId),failureCode:null};return;
  }
  const capture=attempt?await Payment.findOne({_id:attempt.sourcePaymentId,tenantId:data.tenantId,orderId:attempt.orderId,direction:"capture",method:"stripe"}).session(session):await Payment.findOne({tenantId:data.tenantId,direction:"capture",method:"stripe",reference:data.paymentIntentId}).sort({createdAt:1,_id:1}).session(session);
  if(!capture||capture.reference!==data.paymentIntentId){result={status:"needs_review",orderId:attempt?String(attempt.orderId):null,failureCode:"REFUND_PAYMENT_NOT_FOUND"};if(attempt?.active){const order=await Order.findOne({_id:attempt.orderId,tenantId:data.tenantId}).select("+stripeRefundsPendingMinor").session(session);if(order){order.stripeRefundsPendingMinor=Math.max(0,(order.stripeRefundsPendingMinor??0)-attempt.amountMinor);await order.save({session})}attempt.status="needs_review";attempt.active=false;attempt.stripeRefundId=data.refundId;await attempt.save({session})}return}
  const order=await Order.findOne({_id:capture.orderId,tenantId:data.tenantId}).select("+stripeRefundsPendingMinor").session(session);
  if(!order){result={status:"needs_review",orderId:null,failureCode:"REFUND_ORDER_NOT_FOUND"};return}
  const totals=await Payment.aggregate<{direction:string;total:number}>([{$match:{tenantId:order.tenantId,orderId:order._id}},{$group:{_id:"$direction",total:{$sum:"$amountMinor"}}}]).session(session);
  const captureRefunds=await Payment.aggregate<{total:number}>([{$match:{tenantId:order.tenantId,orderId:order._id,direction:"refund",sourcePaymentId:capture._id}},{$group:{_id:null,total:{$sum:"$amountMinor"}}}]).session(session);
  const captured=totals.find(item=>item.direction==="capture")?.total??0,refunded=totals.find(item=>item.direction==="refund")?.total??0,pending=order.stripeRefundsPendingMinor??0,sourceRefunded=captureRefunds[0]?.total??0;
  let refundable=0;try{refundable=remainingRefundableMinor(captured,refunded,attempt?.active?pending-attempt.amountMinor:pending)}catch{refundable=-1}
  const mismatch=Boolean(attempt&&(attempt.amountMinor!==data.amountMinor||attempt.currency!==data.currency||attempt.paymentIntentId!==data.paymentIntentId||String(attempt.sourcePaymentId)!==String(capture._id)))||capture.currency!==data.currency||data.amountMinor>capture.amountMinor-sourceRefunded||refundable<0||data.amountMinor>refundable;
  if(mismatch){
   if(attempt?.active){order.stripeRefundsPendingMinor=Math.max(0,pending-attempt.amountMinor);attempt.status="needs_review";attempt.active=false;attempt.stripeRefundId=data.refundId;await attempt.save({session});await order.save({session})}
   result={status:"needs_review",orderId:String(order._id),failureCode:"REFUND_AMOUNT_OR_SOURCE_MISMATCH"};
   await AuditEvent.create([{tenantId:order.tenantId,actorId:null,action:"integration.stripe_refund_needs_review",entityType:"integration",entityId:data.refundId,requestId:data.eventId||data.refundId,metadata:{orderNumber:order.orderNumber,amountMinor:data.amountMinor,currency:data.currency,failureCode:result.failureCode}}],{session});return;
  }
  const fingerprint=createHash("sha256").update(`${data.refundId}:${capture._id}:${data.amountMinor}:${data.currency}`).digest("hex"),key=`stripe_refund_${data.refundId}`;
  const[entry]=await Payment.create([{tenantId:order.tenantId,orderId:order._id,sourcePaymentId:capture._id,direction:"refund",method:"stripe",amountMinor:data.amountMinor,currency:data.currency,reference:data.refundId,note:attempt?.note||"Stripe refund verified",idempotencyKey:key,requestFingerprint:fingerprint,verifiedBy:null,...(data.eventId?{providerEventId:data.eventId}:{})}],{session});
  order.paymentStatus=paymentStatusFromLedger(captured,refunded+data.amountMinor,order.totalMinor) as typeof order.paymentStatus;
  if(attempt?.active)order.stripeRefundsPendingMinor=Math.max(0,pending-attempt.amountMinor);
  await order.save({session});
  if(attempt){attempt.status="succeeded";attempt.active=false;attempt.stripeRefundId=data.refundId;await attempt.save({session})}
  await AuditEvent.create([{tenantId:order.tenantId,actorId:null,action:"payment.stripe_refund_verified",entityType:"payment",entityId:String(entry._id),requestId:data.eventId||data.refundId,metadata:{orderNumber:order.orderNumber,refundId:data.refundId,amountMinor:data.amountMinor,currency:data.currency,paymentStatus:order.paymentStatus}}],{session});
  result={status:"processed",orderId:String(order._id),failureCode:null};
 })}finally{await session.endSession()}
 return result;
}

export async function finishStripeRefundAttempt(input:{tenantId:string;requestKey:string;status:"pending"|"failed"|"canceled";refundId:string|null}){
 const session=await mongoose.startSession();try{await session.withTransaction(async()=>{
  const attempt=await StripeRefundAttempt.findOne({tenantId:input.tenantId,idempotencyKey:input.requestKey,active:true}).session(session);if(!attempt)return;
  if(input.status==="pending"){attempt.status="pending";if(input.refundId)attempt.stripeRefundId=input.refundId;await attempt.save({session});return}
  const order=await Order.findOne({_id:attempt.orderId,tenantId:input.tenantId}).select("+stripeRefundsPendingMinor").session(session);if(order){order.stripeRefundsPendingMinor=Math.max(0,(order.stripeRefundsPendingMinor??0)-attempt.amountMinor);await order.save({session})}
  attempt.status=input.status;attempt.active=false;if(input.refundId)attempt.stripeRefundId=input.refundId;await attempt.save({session});
 })}finally{await session.endSession()}
}
