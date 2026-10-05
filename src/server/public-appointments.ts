import {connectDatabase} from "./db";
import {Appointment} from "./models/Appointment";
import {Tenant} from "./models/Tenant";
import {hashSessionToken} from "./secrets";
export function validAppointmentToken(token:string){return /^[A-Za-z0-9_-]{43}$/.test(token)}
export async function findPublicAppointment(token:string){
 if(!validAppointmentToken(token))return null;
 await connectDatabase();
 const appointment=await Appointment.findOne({manageTokenHash:hashSessionToken(token),manageTokenExpiresAt:{$gt:new Date()}}).select("_id tenantId customerName serviceItemId serviceName serviceDurationMinutes resourceId resourceName startsAt endsAt bufferedStartsAt bufferedEndsAt businessTimezone status cancellationPolicyHours cancellationNote manageTokenExpiresAt").lean();
 if(!appointment)return null;
 const tenant=await Tenant.findById(appointment.tenantId).select("name storefrontContactEmail appointmentsEnabled appointmentHours appointmentClosures timezone").lean();
 if(!tenant)return null;
 return{appointment,tenant};
}
export function requestIp(request:Request){return(request.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim().slice(0,80)||"unknown"}
