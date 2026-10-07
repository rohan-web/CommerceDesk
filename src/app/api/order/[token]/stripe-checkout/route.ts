import {randomBytes} from "node:crypto";
import {NextResponse} from "next/server";
import {Order} from "@/server/models/Order";
import {Payment} from "@/server/models/Payment";
import {StripeConnection} from "@/server/models/StripeConnection";
import {StripeCheckoutAttempt} from "@/server/models/StripeCheckoutAttempt";
import {AuditEvent} from "@/server/models/AuditEvent";
import {hashSessionToken,decryptSecret} from "@/server/secrets";
import {createStripeCheckoutSession,StripeApiError} from "@/server/stripe-client";
import {isSameOrigin} from "@/server/request-security";
import {nextStorefrontPaymentMinor} from "@/server/domain/storefront-payments";
export const dynamic="force-dynamic";
type Context={params:Promise<{token:string}>};
const maxSessionSeconds=24*60*60,minSessionSeconds=35*60;
function jsonError(error:string,status:number){return NextResponse.json({error},{status,headers:{"Cache-Control":"private, no-store"}})}
function fail(){return jsonError("Secure checkout is temporarily unavailable. Please try again.",503)}
function validToken(token:string){return /^[A-Za-z0-9_-]{43}$/.test(token)}
async function activeAttempt(tenantId:unknown,orderId:unknown){return StripeCheckoutAttempt.findOne({tenantId,orderId,active:true}).select("+sessionUrl").lean()}
export async function POST(request:Request,context:Context){
 if(!isSameOrigin(request))return jsonError("Request origin could not be verified.",403);
 const{token}=await context.params;if(!validToken(token))return jsonError("Order receipt not found.",404);
 const appUrl=process.env.APP_URL;if(!appUrl)return jsonError("Secure checkout is not configured for this store.",503);
 let base:URL;try{base=new URL(appUrl);if(base.protocol!=="https:"&&base.hostname!=="localhost")return jsonError("Secure checkout requires an HTTPS application URL.",503)}catch{return jsonError("Secure checkout is not configured for this store.",503)}
 try{
  const order=await Order.findOne({receiptTokenHash:hashSessionToken(token),source:{$in:["storefront","quote"]},receiptTokenExpiresAt:{$gt:new Date()}}).select("_id tenantId orderNumber customerSnapshot currency totalMinor depositDueMinor status paymentStatus reservationExpiresAt").lean();
  if(!order)return jsonError("Order receipt not found.",404);
  if(order.status==="cancelled"||order.paymentStatus==="cancelled")return jsonError("This order is no longer accepting payment.",409);
  if(["paid","refunded"].includes(order.paymentStatus))return jsonError("This order has already been paid.",409);
  const connection=await StripeConnection.findOne({tenantId:order.tenantId,status:"connected",chargesEnabled:true}).select("accountId +apiKeyEncrypted").lean();
  if(!connection)return jsonError("Online card payments are not available for this store. Contact the business.",409);
  const totals=await Payment.aggregate<{direction:string;total:number}>([{$match:{tenantId:order.tenantId,orderId:order._id}},{$group:{_id:"$direction",total:{$sum:"$amountMinor"}}}]);
  const captured=totals.find(item=>item.direction==="capture")?.total??0,refunded=totals.find(item=>item.direction==="refund")?.total??0;let due:number;try{due=nextStorefrontPaymentMinor(order.totalMinor,captured,refunded,order.depositDueMinor||order.totalMinor)}catch{return jsonError("The payment balance needs business review.",409)}
  if(!Number.isSafeInteger(due)||due<1)return jsonError("There is no outstanding balance for this order.",409);
  const now=new Date(),hasActiveHold=order.status==="pending_payment"&&Boolean(order.reservationExpiresAt);let holdUntil=hasActiveHold?new Date(order.reservationExpiresAt!):new Date(now.getTime()+maxSessionSeconds*1000);
  if(hasActiveHold&&holdUntil<=now)return jsonError("The payment window expired. Contact the business before placing another order.",409);
  if(hasActiveHold&&holdUntil.getTime()-now.getTime()<minSessionSeconds*1000){
   const extended=new Date(now.getTime()+minSessionSeconds*1000);
   const updated=await Order.updateOne({_id:order._id,tenantId:order.tenantId,status:"pending_payment",reservationExpiresAt:{$gt:now}},{$set:{reservationExpiresAt:extended}});
   if(updated.modifiedCount!==1)return jsonError("The stock reservation expired. Contact the business before placing another order.",409);
   holdUntil=extended;
  }
  const expiresAt=new Date(Math.min(holdUntil.getTime(),now.getTime()+maxSessionSeconds*1000));
  const expiresAtSeconds=Math.floor(expiresAt.getTime()/1000);
  if(expiresAtSeconds-Math.floor(now.getTime()/1000)<minSessionSeconds)return jsonError("The stock hold is too short for secure checkout. Contact the business.",409);

  let attempt=await activeAttempt(order.tenantId,order._id);
  if(attempt?.status==="complete")return jsonError("This order has already been paid.",409);
  if(attempt?.status==="open"&&attempt.expiresAt>now){
   if(attempt.amountMinor!==due||attempt.currency!==order.currency)return jsonError("A different payment session is already active. Wait for it to expire or contact the business.",409);
   if(attempt.sessionUrl)return NextResponse.json({url:attempt.sessionUrl},{headers:{"Cache-Control":"private, no-store"}});
  }
  if(attempt&&((attempt.status==="open"&&attempt.expiresAt<=now)||(attempt.status==="creating"&&attempt.expiresAt<=now)||attempt.status==="failed")){
   await StripeCheckoutAttempt.updateOne({_id:attempt._id,active:true,...(attempt.status==="failed"?{status:"failed"}:{status:attempt.status,expiresAt:{$lte:now}})},{$set:{active:false,status:"expired"}});
   attempt=await activeAttempt(order.tenantId,order._id);
  }
  if(attempt?.status==="expired"&&!attempt.active)attempt=null;
  if(!attempt){
   try{await StripeCheckoutAttempt.create({tenantId:order.tenantId,orderId:order._id,idempotencyKey:randomBytes(24).toString("base64url"),status:"creating",active:true,amountMinor:due,currency:order.currency,expiresAt})}
   catch(error){if((error as {code?:number})?.code!==11000)throw error}
   attempt=await activeAttempt(order.tenantId,order._id);
  }
  if(!attempt)return jsonError("Secure checkout could not be reserved. Please try again.",503);
  if(attempt.status==="open"&&attempt.sessionUrl)return NextResponse.json({url:attempt.sessionUrl},{headers:{"Cache-Control":"private, no-store"}});
  if(attempt.status==="complete")return jsonError("This order has already been paid.",409);
  if(attempt.amountMinor!==due||attempt.currency!==order.currency)return jsonError("A different payment session is already being prepared. Try again in a moment.",409);

  const receiptUrl=new URL(`/order/${encodeURIComponent(token)}`,base).toString();
  const session=await createStripeCheckoutSession({apiKey:decryptSecret(connection.apiKeyEncrypted),idempotencyKey:attempt.idempotencyKey,amountMinor:attempt.amountMinor,currency:attempt.currency,productName:`Order ${order.orderNumber}`,customerEmail:order.customerSnapshot?.email,successUrl:`${receiptUrl}?payment=processing&session_id={CHECKOUT_SESSION_ID}`,cancelUrl:`${receiptUrl}?payment=cancelled`,expiresAtSeconds:Math.floor(attempt.expiresAt.getTime()/1000),metadata:{tenant_id:String(order.tenantId),order_id:String(order._id),order_number:order.orderNumber,checkout_attempt_id:String(attempt._id)}});
  await StripeCheckoutAttempt.updateOne({_id:attempt._id,active:true,status:"creating"},{$set:{status:"open",stripeSessionId:session.id,sessionUrl:session.url,expiresAt:new Date(session.expiresAtSeconds*1000)}});
  await AuditEvent.create({tenantId:order.tenantId,actorId:null,action:"payment.stripe_checkout_created",entityType:"order",entityId:String(order._id),requestId:String(attempt.idempotencyKey),metadata:{orderNumber:order.orderNumber,amountMinor:due,currency:order.currency,accountId:connection.accountId,sessionId:session.id}});
  return NextResponse.json({url:session.url},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){if(error instanceof StripeApiError)return jsonError(error.message,error.status);return fail()}
}
