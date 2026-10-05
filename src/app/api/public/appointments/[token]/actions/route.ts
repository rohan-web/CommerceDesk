import {randomBytes} from "node:crypto";
import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {z} from "zod";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import {findPublicAppointment,requestIp} from "@/server/public-appointments";
import {consumePublicAppointmentAttempt,consumePublicAppointmentLookup} from "@/server/rate-limit";
import {Appointment} from "@/server/models/Appointment";
import {AppointmentEvent} from "@/server/models/AppointmentEvent";
import {AuditEvent} from "@/server/models/AuditEvent";
import {Tenant} from "@/server/models/Tenant";
import {ServiceResource} from "@/server/models/ServiceResource";
import {CatalogueItem} from "@/server/models/CatalogueItem";
import {hasIntervalCapacity,isWithinAppointmentChangeWindow,localDateInZone,slotsForLocalDate} from "@/server/domain/appointments";
import {hashSessionToken} from "@/server/secrets";
export const dynamic="force-dynamic";
type Context={params:Promise<{token:string}>};
const schema=z.discriminatedUnion("action",[z.object({action:z.literal("cancel")}).strict(),z.object({action:z.literal("reschedule"),resourceId:z.string().regex(/^[a-f\d]{24}$/i),startsAt:z.string().datetime({offset:true})}).strict()]);
function invalid(error:unknown){if(!(error instanceof Error))return null;switch(error.message){case"TOKEN_NOT_FOUND":case"APPOINTMENT_NOT_FOUND":return NextResponse.json({error:"Appointment link was not found or has expired."},{status:404});case"APPOINTMENT_CLOSED":return NextResponse.json({error:"This appointment is no longer active."},{status:409});case"POLICY_CUTOFF":return NextResponse.json({error:"The online cancellation and change window has closed."},{status:409});case"ONLINE_DISABLED":return NextResponse.json({error:"Online appointment changes are currently unavailable."},{status:409});case"INVALID_SLOT":return NextResponse.json({error:"Choose an available time within business hours."},{status:409});case"SLOT_FULL":return NextResponse.json({error:"That time was just booked. Refresh availability and choose another slot."},{status:409});default:return null}}
export async function PATCH(request:Request,context:Context){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
 const body=await readJsonLimited(request,5000);if(body.kind==="too-large")return NextResponse.json({error:"Request is too large."},{status:413});const parsed=schema.safeParse(body.kind==="ok"?body.value:null);if(!parsed.success)return NextResponse.json({error:"Choose cancel or provide an available replacement time."},{status:400});
 const{token}=await context.params;let loaded;try{if(await consumePublicAppointmentLookup(requestIp(request))>120)return NextResponse.json({error:"Too many requests. Try again later."},{status:429});loaded=await findPublicAppointment(token)}catch{return NextResponse.json({error:"Appointment service is temporarily unavailable."},{status:503})}if(!loaded)return NextResponse.json({error:"Appointment link was not found or has expired."},{status:404});
 try{if(await consumePublicAppointmentAttempt(String(loaded.appointment.tenantId),requestIp(request))>40)return NextResponse.json({error:"Too many appointment link requests. Try again later."},{status:429})}catch{return NextResponse.json({error:"Appointment service is temporarily unavailable."},{status:503})}
 const tokenHash=hashSessionToken(token),tenantId=loaded.appointment.tenantId,session=await mongoose.startSession();let result:unknown;
 try{await session.withTransaction(async()=>{
  const appointment=await Appointment.findOne({manageTokenHash:tokenHash,manageTokenExpiresAt:{$gt:new Date()},tenantId}).session(session);if(!appointment)throw new Error("TOKEN_NOT_FOUND");if(appointment.status!=="confirmed")throw new Error("APPOINTMENT_CLOSED");const now=new Date();if(!isWithinAppointmentChangeWindow(appointment.startsAt,appointment.cancellationPolicyHours,now))throw new Error("POLICY_CUTOFF");
  if(parsed.data.action==="cancel"){
   appointment.status="cancelled";appointment.cancellationNote="Cancelled by customer using private appointment link.";appointment.set("manageTokenHash",null);appointment.set("manageTokenExpiresAt",null);appointment.version+=1;await appointment.save({session});
   await AppointmentEvent.create([{tenantId,appointmentId:appointment._id,actorId:null,action:"customer_cancelled",details:{from:"confirmed",to:"cancelled",customerInitiated:true}}],{session});
   await AuditEvent.create([{tenantId,actorId:null,action:"appointment.customer_cancelled",entityType:"appointment",entityId:String(appointment._id),requestId:randomBytes(12).toString("hex"),metadata:{customerInitiated:true}}],{session});
  }else{
   const targetStart=new Date(parsed.data.startsAt);if(targetStart<=now)throw new Error("INVALID_SLOT");const tenant=await Tenant.findOne({_id:tenantId,appointmentsEnabled:true}).select("appointmentHours appointmentClosures timezone").session(session).lean();if(!tenant)throw new Error("ONLINE_DISABLED");const resource=await ServiceResource.findOne({_id:parsed.data.resourceId,tenantId,active:true}).session(session).lean();if(!resource)throw new Error("INVALID_SLOT");const localDate=localDateInZone(targetStart,tenant.timezone),weekday=new Date(`${localDate}T12:00:00.000Z`).getUTCDay(),hours=tenant.appointmentHours.find(day=>day.weekday===weekday);if(!hours)throw new Error("INVALID_SLOT");
   const slot=slotsForLocalDate({date:localDate,timeZone:tenant.timezone,openMinute:hours.openMinute,closeMinute:hours.closeMinute,durationMinutes:appointment.serviceDurationMinutes,bufferBeforeMinutes:resource.bufferBeforeMinutes,bufferAfterMinutes:resource.bufferAfterMinutes}).find(candidate=>candidate.startsAt.getTime()===targetStart.getTime());if(!slot||tenant.appointmentClosures.some(closure=>slot.bufferedStartsAt<closure.endsAt&&slot.bufferedEndsAt>closure.startsAt))throw new Error("INVALID_SLOT");
   const currentService=await CatalogueItem.findOne({_id:appointment.serviceItemId,tenantId,status:"active",kind:"service"}).select("_id").session(session).lean();if(!currentService)throw new Error("INVALID_SLOT");
   const resourceIds=[...new Set([String(appointment.resourceId),String(resource._id)])].sort();for(const resourceId of resourceIds){const locked=await ServiceResource.findOneAndUpdate({_id:resourceId,tenantId},{$inc:{version:1}},{new:true,session});if(!locked)throw new Error("INVALID_SLOT")}
   const nowForHolds=new Date(),conflicts=await Appointment.find({_id:{$ne:appointment._id},tenantId,resourceId:resource._id,bufferedStartsAt:{$lt:slot.bufferedEndsAt},bufferedEndsAt:{$gt:slot.bufferedStartsAt},$or:[{status:"confirmed"},{status:"held",holdExpiresAt:{$gt:nowForHolds}}]}).select("bufferedStartsAt bufferedEndsAt").session(session).lean();if(!hasIntervalCapacity({startAt:slot.bufferedStartsAt,endAt:slot.bufferedEndsAt},conflicts.map(item=>({startAt:item.bufferedStartsAt,endAt:item.bufferedEndsAt})),resource.capacity))throw new Error("SLOT_FULL");
   const previous={resourceId:String(appointment.resourceId),startsAt:appointment.startsAt.toISOString()};appointment.resourceId=resource._id;appointment.resourceName=resource.name;appointment.startsAt=slot.startsAt;appointment.endsAt=slot.endsAt;appointment.bufferedStartsAt=slot.bufferedStartsAt;appointment.bufferedEndsAt=slot.bufferedEndsAt;appointment.businessTimezone=tenant.timezone;appointment.version+=1;await appointment.save({session});
   await AppointmentEvent.create([{tenantId,appointmentId:appointment._id,actorId:null,action:"customer_rescheduled",details:{from:previous,to:{resourceId:String(resource._id),startsAt:slot.startsAt.toISOString()},customerInitiated:true,reserveBeforeRelease:true}}],{session});
   await AuditEvent.create([{tenantId,actorId:null,action:"appointment.customer_rescheduled",entityType:"appointment",entityId:String(appointment._id),requestId:randomBytes(12).toString("hex"),metadata:{from:previous,to:{resourceId:String(resource._id),startsAt:slot.startsAt.toISOString()}}}],{session});
  }
  result={status:appointment.status,startsAt:appointment.startsAt,endsAt:appointment.endsAt,resourceName:appointment.resourceName,businessTimezone:appointment.businessTimezone};
 })}catch(error){const response=invalid(error);if(response)return response;return NextResponse.json({error:"Appointment could not be updated right now."},{status:503})}finally{await session.endSession()}
 return NextResponse.json({appointment:result},{headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}
