import {randomBytes} from "node:crypto";
import {NextResponse} from "next/server";
import {z} from "zod";
import {requireTenantAccess} from "@/server/tenant-scope";
import {Tenant} from "@/server/models/Tenant";
import {ServiceResource} from "@/server/models/ServiceResource";
import {CatalogueItem} from "@/server/models/CatalogueItem";
import {AuditEvent} from "@/server/models/AuditEvent";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";

export const dynamic="force-dynamic";
const hoursSchema=z.object({weekday:z.number().int().min(0).max(6),openMinute:z.number().int().min(0).max(1439),closeMinute:z.number().int().min(1).max(1440)}).strict();
const closureSchema=z.object({startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}),label:z.string().trim().max(120).default("")}).strict().refine(value=>Date.parse(value.startsAt)<Date.parse(value.endsAt),{message:"Closure end must be later than its start.",path:["endsAt"]});
const settingsSchema=z.object({enabled:z.boolean(),hours:z.array(hoursSchema).max(7),closures:z.array(closureSchema).max(100),cancellationHours:z.number().int().min(0).max(8760)}).strict().superRefine((value,context)=>{
 const weekdays=value.hours.map(item=>item.weekday);if(new Set(weekdays).size!==weekdays.length)context.addIssue({code:"custom",path:["hours"],message:"Each weekday can appear only once."});
 if(value.hours.some(item=>item.openMinute>=item.closeMinute))context.addIssue({code:"custom",path:["hours"],message:"Each opening time must be before its closing time."});
 if(value.enabled&&!value.hours.length)context.addIssue({code:"custom",path:["hours"],message:"Configure at least one open day before enabling appointments."});
});
function failure(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"You do not have permission to configure appointments."},{status:403});return NextResponse.json({error:"Appointment settings are temporarily unavailable."},{status:503})}
export async function GET(){
 let access;try{access=await requireTenantAccess("appointments:write")}catch(error){return failure(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 try{const tenant=await Tenant.findById(access.scope.tenantId).select("appointmentsEnabled appointmentHours appointmentClosures appointmentCancellationHours timezone").lean();if(!tenant)return NextResponse.json({error:"Workspace not found."},{status:404});return NextResponse.json({settings:{enabled:tenant.appointmentsEnabled,hours:tenant.appointmentHours,closures:tenant.appointmentClosures,cancellationHours:tenant.appointmentCancellationHours,timezone:tenant.timezone}},{headers:{"Cache-Control":"private, no-store"}})}catch(error){return failure(error)}
}
export async function PATCH(request:Request){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
 let access;try{access=await requireTenantAccess("appointments:write")}catch(error){return failure(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 if(Number(request.headers.get("content-length")||0)>20000)return NextResponse.json({error:"Request is too large."},{status:413});const body=await readJsonLimited(request,24000);if(body.kind==="too-large")return NextResponse.json({error:"Request is too large."},{status:413});const parsed=settingsSchema.safeParse(body.kind==="ok"?body.value:null);if(!parsed.success)return NextResponse.json({error:"Review appointment hours, closures and cancellation policy.",issues:parsed.error.issues.map(issue=>({field:issue.path.join("."),message:issue.message}))},{status:400});
 if(parsed.data.enabled){const[resources,services]=await Promise.all([ServiceResource.countDocuments({tenantId:access.scope.tenantId,active:true}),CatalogueItem.countDocuments({tenantId:access.scope.tenantId,status:"active",kind:"service",serviceDurationMinutes:{$gte:5}})]);if(!resources||!services)return NextResponse.json({error:"Add an active appointment resource and an active service before enabling bookings."},{status:409})}
 const now=Date.now();for(const closure of parsed.data.closures){if(Date.parse(closure.startsAt)<now-365*86400000)return NextResponse.json({error:"Closures older than one year cannot be configured."},{status:400})}
 try{const tenant=await Tenant.findOneAndUpdate({_id:access.scope.tenantId},{$set:{appointmentsEnabled:parsed.data.enabled,appointmentHours:parsed.data.hours,appointmentClosures:parsed.data.closures.map(item=>({...item,startsAt:new Date(item.startsAt),endsAt:new Date(item.endsAt)})),appointmentCancellationHours:parsed.data.cancellationHours}},{new:true,runValidators:true}).select("appointmentsEnabled appointmentHours appointmentClosures appointmentCancellationHours timezone").lean();if(!tenant)return NextResponse.json({error:"Workspace not found."},{status:404});await AuditEvent.create({tenantId:access.scope.tenantId,actorId:access.scope.userId,action:"appointments.settings_updated",entityType:"tenant",entityId:String(tenant._id),requestId:randomBytes(12).toString("hex"),metadata:{enabled:tenant.appointmentsEnabled,weekdays:tenant.appointmentHours.map(day=>day.weekday),closureCount:tenant.appointmentClosures.length}});return NextResponse.json({settings:{enabled:tenant.appointmentsEnabled,hours:tenant.appointmentHours,closures:tenant.appointmentClosures,cancellationHours:tenant.appointmentCancellationHours,timezone:tenant.timezone}},{headers:{"Cache-Control":"private, no-store"}})}catch(error){return failure(error)}
}
