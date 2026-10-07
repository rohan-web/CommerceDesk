import {Worker} from "bullmq";
import IORedis from "ioredis";
import mongoose from "mongoose";
import {connectDatabase} from "../server/db";
import {Order} from "../server/models/Order";
import {CatalogueItem} from "../server/models/CatalogueItem";
import {CatalogueVariant} from "../server/models/CatalogueVariant";
import {StockMovement} from "../server/models/StockMovement";
import {AuditEvent} from "../server/models/AuditEvent";
import {Appointment} from "../server/models/Appointment";
import {AppointmentEvent} from "../server/models/AppointmentEvent";
import {sweepPrivateWorkOrderFiles} from "./private-files";
import {sweepEmailDeliveries} from "../server/email-delivery";
const url=process.env.REDIS_URL;
if(!url)throw new Error("REDIS_URL is required to start the persistent worker.");
const connection=new IORedis(url,{maxRetriesPerRequest:null,enableReadyCheck:true});
const heartbeat=setInterval(()=>{void connection.set("commercedesk:worker:heartbeat",String(Date.now()),"EX",45).catch(error=>console.error(JSON.stringify({level:"error",event:"heartbeat_failed",error:error.message})))},15000);heartbeat.unref();
async function expireOrderHold(data:{tenantId:string;orderId:string},jobId:string){
 await connectDatabase();const session=await mongoose.startSession();try{await session.withTransaction(async()=>{
  const order=await Order.findOne({_id:data.orderId,tenantId:data.tenantId,status:"pending_payment",paymentStatus:{$in:["pending","unpaid"]},reservationExpiresAt:{$lte:new Date()}}).session(session);if(!order)return;
  for(const line of order.lines){if(!line.tracksStock)continue;const released=line.variantId?await CatalogueVariant.findOneAndUpdate({_id:line.variantId,itemId:line.itemId,tenantId:data.tenantId,stockReserved:{$gte:line.quantity}},{$inc:{stockReserved:-line.quantity,version:1}},{new:true,session}):await CatalogueItem.findOneAndUpdate({_id:line.itemId,tenantId:data.tenantId,stockReserved:{$gte:line.quantity}},{$inc:{stockReserved:-line.quantity,version:1}},{new:true,session});if(!released)throw new Error("ORDER_HOLD_RESERVATION_MISMATCH");await StockMovement.create([{tenantId:data.tenantId,itemId:line.itemId,variantId:line.variantId||null,actorId:null,requestId:`hold-expired:${order._id}:${line.itemId}:${line.variantId||"base"}`,reason:"order_hold_expired",quantityDelta:0,stockBefore:released.stockOnHand,stockAfter:released.stockOnHand,note:`Released ${line.quantity} reserved unit(s) for expired ${order.orderNumber}`}],{session})}
  order.status="cancelled";order.paymentStatus="cancelled";order.fulfilmentStatus="cancelled";order.cancelReason="hold_expired";await order.save({session});await AuditEvent.create([{tenantId:data.tenantId,actorId:null,action:"storefront.order_hold_expired",entityType:"order",entityId:String(order._id),requestId:jobId,metadata:{orderNumber:order.orderNumber,expiredAt:order.reservationExpiresAt?.toISOString(),releasedLines:order.lines.filter(line=>line.tracksStock).length}}],{session});
 })}finally{await session.endSession()}}
async function sweepExpiredHolds(){try{await connectDatabase();const due=await Order.find({status:"pending_payment",paymentStatus:{$in:["pending","unpaid"]},reservationExpiresAt:{$lte:new Date()}}).select("_id tenantId").sort({reservationExpiresAt:1}).limit(50).lean();for(const order of due)await expireOrderHold({tenantId:String(order.tenantId),orderId:String(order._id)},`sweep:${order._id}`)}catch(error){console.error(JSON.stringify({level:"error",event:"expired_hold_sweep_failed",error:error instanceof Error?error.message:"DATABASE_ERROR"}))}}
async function sweepExpiredAppointmentHolds(){try{await connectDatabase();const due=await Appointment.find({status:"held",holdExpiresAt:{$lte:new Date()}}).select("_id tenantId holdExpiresAt").sort({holdExpiresAt:1}).limit(100).lean();for(const item of due){const session=await mongoose.startSession();try{await session.withTransaction(async()=>{const updated=await Appointment.findOneAndUpdate({_id:item._id,tenantId:item.tenantId,status:"held",holdExpiresAt:{$lte:new Date()}},{$set:{status:"expired",holdExpiresAt:null},$inc:{version:1}},{new:true,session});if(!updated)return;await AppointmentEvent.create([{tenantId:item.tenantId,appointmentId:item._id,actorId:null,action:"expired",details:{expiredAt:item.holdExpiresAt}}],{session});await AuditEvent.create([{tenantId:item.tenantId,actorId:null,action:"appointment.hold_expired",entityType:"appointment",entityId:String(item._id),requestId:`appointment-hold-expired:${item._id}`,metadata:{expiredAt:item.holdExpiresAt?.toISOString()}}],{session})})}finally{await session.endSession()}}}catch(error){console.error(JSON.stringify({level:"error",event:"expired_appointment_hold_sweep_failed",error:error instanceof Error?error.message:"DATABASE_ERROR"}))}}
const sweeper=setInterval(()=>{void sweepExpiredHolds();void sweepExpiredAppointmentHolds()},30000);sweeper.unref();
const privateFileSweeper=setInterval(()=>{void sweepPrivateWorkOrderFiles().catch(error=>console.error(JSON.stringify({level:"error",event:"private_work_order_file_sweep_failed",error:error instanceof Error?error.message:"FILE_SWEEP_FAILED"})))},5*60*1000);privateFileSweeper.unref();
let emailSweepRunning=false;async function runEmailDeliverySweep(){if(emailSweepRunning)return;emailSweepRunning=true;try{await sweepEmailDeliveries()}catch(error){console.error(JSON.stringify({level:"error",event:"tenant_email_sweep_failed",error:error instanceof Error?error.name:"UNKNOWN_ERROR"}))}finally{emailSweepRunning=false}}
const emailDeliverySweeper=setInterval(()=>void runEmailDeliverySweep(),15000);emailDeliverySweeper.unref();
void sweepExpiredHolds();void sweepExpiredAppointmentHolds();void sweepPrivateWorkOrderFiles().catch(error=>console.error(JSON.stringify({level:"error",event:"private_work_order_file_sweep_failed",error:error instanceof Error?error.message:"FILE_SWEEP_FAILED"})));void runEmailDeliverySweep();
const worker=new Worker("commercedesk-events",async job=>{
 if(job.name==="expire-store-order-hold"){const data=job.data as {tenantId:string;orderId:string};if(!data||typeof data.tenantId!=="string"||typeof data.orderId!=="string")throw new Error("Invalid store order hold job payload.");await expireOrderHold(data,String(job.id));return}
 throw new Error(`No handler registered for event type: ${job.name}`)
},{connection,concurrency:4,autorun:false});
worker.on("failed",(job,error)=>console.error(JSON.stringify({level:"error",event:"job_failed",jobId:job?.id,error:error.message})));
worker.on("error",error=>console.error(JSON.stringify({level:"error",event:"worker_error",error:error.message})));
async function shutdown(){clearInterval(heartbeat);clearInterval(sweeper);clearInterval(privateFileSweeper);clearInterval(emailDeliverySweeper);await worker.close();await connection.quit()}
process.once("SIGTERM",()=>void shutdown());process.once("SIGINT",()=>void shutdown());void worker.run();

