import {randomBytes} from "node:crypto";
import {NextResponse} from "next/server";
import {z} from "zod";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import {requireTenantAccess} from "@/server/tenant-scope";
import {ServiceResource} from "@/server/models/ServiceResource";
import {AuditEvent} from "@/server/models/AuditEvent";

export const dynamic="force-dynamic";
const createSchema=z.object({name:z.string().trim().min(2).max(120),kind:z.enum(["staff","equipment"]).default("staff"),capacity:z.number().int().min(1).max(20).default(1),bufferBeforeMinutes:z.number().int().min(0).max(240).default(0),bufferAfterMinutes:z.number().int().min(0).max(240).default(0)}).strict();
function failure(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"You do not have permission to manage appointment resources."},{status:403});return NextResponse.json({error:"Appointment resources are temporarily unavailable."},{status:503})}
export async function GET(){let access;try{access=await requireTenantAccess("appointments:write")}catch(error){return failure(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});try{const resources=await ServiceResource.find({tenantId:access.scope.tenantId}).sort({active:-1,name:1}).lean();return NextResponse.json({resources},{headers:{"Cache-Control":"private, no-store"}})}catch(error){return failure(error)}}
export async function POST(request:Request){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});let access;try{access=await requireTenantAccess("appointments:write")}catch(error){return failure(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 if(Number(request.headers.get("content-length")||0)>8000)return NextResponse.json({error:"Request is too large."},{status:413});const body=await readJsonLimited(request,12000);if(body.kind==="too-large")return NextResponse.json({error:"Request is too large."},{status:413});const parsed=createSchema.safeParse(body.kind==="ok"?body.value:null);if(!parsed.success)return NextResponse.json({error:"Review the resource details and try again.",issues:parsed.error.issues.map(issue=>({field:issue.path.join("."),message:issue.message}))},{status:400});
 try{const resource=await ServiceResource.create({tenantId:access.scope.tenantId,...parsed.data});await AuditEvent.create({tenantId:access.scope.tenantId,actorId:access.scope.userId,action:"appointments.resource_created",entityType:"service_resource",entityId:String(resource._id),requestId:randomBytes(12).toString("hex"),metadata:{kind:resource.kind,capacity:resource.capacity}});return NextResponse.json({resource},{status:201,headers:{"Cache-Control":"private, no-store"}})}catch(error){if((error as {code?:number})?.code===11000)return NextResponse.json({error:"A resource with that name already exists in this workspace."},{status:409});return failure(error)}
}
