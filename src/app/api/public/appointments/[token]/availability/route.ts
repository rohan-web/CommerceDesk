import {NextResponse} from "next/server";
import {findPublicAppointment,requestIp} from "@/server/public-appointments";
import {consumePublicAppointmentAttempt,consumePublicAppointmentLookup} from "@/server/rate-limit";
import {CatalogueItem} from "@/server/models/CatalogueItem";
import {ServiceResource} from "@/server/models/ServiceResource";
import {Appointment} from "@/server/models/Appointment";
import {hasIntervalCapacity,isWithinAppointmentChangeWindow,isValidLocalDate,localDateInZone,slotsForLocalDate} from "@/server/domain/appointments";
export const dynamic="force-dynamic";
type Context={params:Promise<{token:string}>};
export async function GET(request:Request,context:Context){
 const{token}=await context.params,url=new URL(request.url),date=url.searchParams.get("date")||"";
 if(!isValidLocalDate(date))return NextResponse.json({error:"Choose a valid calendar date."},{status:400});
 try{
  if(await consumePublicAppointmentLookup(requestIp(request))>120)return NextResponse.json({error:"Too many requests. Try again later."},{status:429});
  const loaded=await findPublicAppointment(token);if(!loaded)return NextResponse.json({error:"Appointment link was not found or has expired."},{status:404});
  const{appointment,tenant}=loaded;if(await consumePublicAppointmentAttempt(String(appointment.tenantId),requestIp(request))>40)return NextResponse.json({error:"Too many appointment link requests. Try again later."},{status:429});
  if(appointment.status!=="confirmed"||!isWithinAppointmentChangeWindow(appointment.startsAt,appointment.cancellationPolicyHours))return NextResponse.json({error:"This appointment can no longer be changed online."},{status:409});
  const today=localDateInZone(new Date(),tenant.timezone),latest=new Date(Date.now()+366*86400000);if(date<today||date>localDateInZone(latest,tenant.timezone))return NextResponse.json({error:"Choose a date within the next year."},{status:400});
  if(!tenant.appointmentsEnabled)return NextResponse.json({error:"Online scheduling is currently unavailable."},{status:409});
  const weekday=new Date(`${date}T12:00:00.000Z`).getUTCDay(),hours=tenant.appointmentHours.find(day=>day.weekday===weekday);if(!hours)return NextResponse.json({date,timezone:appointment.businessTimezone,resources:[]},{headers:{"Cache-Control":"no-store"}});
  const[service,resources]=await Promise.all([CatalogueItem.findOne({_id:appointment.serviceItemId,tenantId:appointment.tenantId,status:"active",kind:"service",serviceDurationMinutes:{$gte:5}}).lean(),ServiceResource.find({tenantId:appointment.tenantId,active:true}).sort({name:1}).lean()]);
  if(!service)return NextResponse.json({error:"This service is no longer available for rescheduling."},{status:409});
  const resourcesWithSlots=await Promise.all(resources.map(async resource=>{const candidates=slotsForLocalDate({date,timeZone:tenant.timezone,openMinute:hours.openMinute,closeMinute:hours.closeMinute,durationMinutes:appointment.serviceDurationMinutes,bufferBeforeMinutes:resource.bufferBeforeMinutes,bufferAfterMinutes:resource.bufferAfterMinutes});const first=candidates[0]?.bufferedStartsAt,last=candidates.at(-1)?.bufferedEndsAt;if(!first||!last)return{resource:{id:String(resource._id),name:resource.name},slots:[]};const existing=await Appointment.find({tenantId:appointment.tenantId,resourceId:resource._id,_id:{$ne:appointment._id},bufferedStartsAt:{$lt:last},bufferedEndsAt:{$gt:first},$or:[{status:"confirmed"},{status:"held",holdExpiresAt:{$gt:new Date()}}]}).select("bufferedStartsAt bufferedEndsAt").lean();const slots=candidates.filter(slot=>slot.startsAt>new Date()&&!tenant.appointmentClosures.some(closure=>slot.bufferedStartsAt<closure.endsAt&&slot.bufferedEndsAt>closure.startsAt)&&hasIntervalCapacity({startAt:slot.bufferedStartsAt,endAt:slot.bufferedEndsAt},existing.map(item=>({startAt:item.bufferedStartsAt,endAt:item.bufferedEndsAt})),resource.capacity)).map(slot=>({startsAt:slot.startsAt.toISOString(),endsAt:slot.endsAt.toISOString(),label:slot.label,offset:slot.offsetLabel}));return{resource:{id:String(resource._id),name:resource.name},slots}}));
  return NextResponse.json({date,timezone:tenant.timezone,resources:resourcesWithSlots},{headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
 }catch{return NextResponse.json({error:"Appointment availability is temporarily unavailable."},{status:503})}
}
