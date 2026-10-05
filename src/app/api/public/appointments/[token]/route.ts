import {NextResponse} from "next/server";
import {findPublicAppointment,requestIp} from "@/server/public-appointments";
import {consumePublicAppointmentAttempt,consumePublicAppointmentLookup} from "@/server/rate-limit";
import {isWithinAppointmentChangeWindow} from "@/server/domain/appointments";
export const dynamic="force-dynamic";
type Context={params:Promise<{token:string}>};
export async function GET(request:Request,context:Context){
 const{token}=await context.params;
 try{
  if(await consumePublicAppointmentLookup(requestIp(request))>120)return NextResponse.json({error:"Too many requests. Try again later."},{status:429});
  const loaded=await findPublicAppointment(token);if(!loaded)return NextResponse.json({error:"Appointment link was not found or has expired."},{status:404});
  if(await consumePublicAppointmentAttempt(String(loaded.appointment.tenantId),requestIp(request))>40)return NextResponse.json({error:"Too many appointment link requests. Try again later."},{status:429});
  const{appointment,tenant}=loaded,deadline=appointment.startsAt.getTime()-appointment.cancellationPolicyHours*3600000,canChange=appointment.status==="confirmed"&&isWithinAppointmentChangeWindow(appointment.startsAt,appointment.cancellationPolicyHours);
  return NextResponse.json({appointment:{customerName:appointment.customerName,serviceName:appointment.serviceName,resourceName:appointment.resourceName,startsAt:appointment.startsAt,endsAt:appointment.endsAt,status:appointment.status,businessTimezone:appointment.businessTimezone,cancellationPolicyHours:appointment.cancellationPolicyHours,manageTokenExpiresAt:appointment.manageTokenExpiresAt},business:{name:tenant.name,contactEmail:tenant.storefrontContactEmail||null,timezone:tenant.timezone},canChange,cancellationDeadline:new Date(deadline)},{headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
 }catch{return NextResponse.json({error:"Customer appointment service is temporarily unavailable."},{status:503})}
}
