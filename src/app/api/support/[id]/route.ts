import {randomBytes} from "node:crypto";
import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {z} from "zod";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import {requireTenantAccess} from "@/server/tenant-scope";
import {SupportCase} from "@/server/models/SupportCase";
import {SupportEvent} from "@/server/models/SupportEvent";
import {AuditEvent} from "@/server/models/AuditEvent";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
const updateSchema=z.object({status:z.enum(["open","assigned","awaiting_customer","awaiting_internal","resolved","closed"]).optional(),note:z.string().trim().min(1).max(2000).optional(),reply:z.string().trim().min(1).max(2000).optional(),resolution:z.string().trim().max(1200).optional()}).strict().refine(data=>data.status!==undefined||data.note!==undefined||data.reply!==undefined||data.resolution!==undefined);
function fail(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"You do not have permission to update support cases."},{status:403});return NextResponse.json({error:"Support service is temporarily unavailable."},{status:503})}
export async function GET(_request:Request,context:Context){
 let access;try{access=await requireTenantAccess("support:write")}catch(error){return fail(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 const{id}=await context.params;if(!mongoose.isValidObjectId(id))return NextResponse.json({error:"Case not found."},{status:404});
 try{const record=await SupportCase.findOne({_id:id,tenantId:access.scope.tenantId}).populate({path:"customerId",match:{tenantId:access.scope.tenantId},select:"name email phone"}).populate({path:"assignedTo",select:"name"}).populate({path:"orderId",match:{tenantId:access.scope.tenantId},select:"orderNumber status totalMinor currency"}).lean();if(!record)return NextResponse.json({error:"Case not found."},{status:404});const events=await SupportEvent.find({tenantId:access.scope.tenantId,caseId:id}).sort({createdAt:1,_id:1}).populate({path:"actorId",select:"name"}).lean();return NextResponse.json({case:record,events},{headers:{"Cache-Control":"private, no-store"}})}catch(error){return fail(error)}
}
export async function PATCH(request:Request,context:Context){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});const body=await readJsonLimited(request,10000);if(body.kind==="too-large")return NextResponse.json({error:"Request is too large."},{status:413});const parsed=updateSchema.safeParse(body.kind==="ok"?body.value:null);if(!parsed.success)return NextResponse.json({error:"Add a private note, customer reply or choose a valid status."},{status:400});
 let access;try{access=await requireTenantAccess("support:write")}catch(error){return fail(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});const{id}=await context.params;if(!mongoose.isValidObjectId(id))return NextResponse.json({error:"Case not found."},{status:404});
 const session=await mongoose.startSession();let output:unknown;
 try{await session.withTransaction(async()=>{
  const record=await SupportCase.findOne({_id:id,tenantId:access!.scope.tenantId}).session(session);if(!record)throw new Error("CASE_NOT_FOUND");const before=record.status;if(parsed.data.status)record.status=parsed.data.status;if(parsed.data.resolution!==undefined)record.resolution=parsed.data.resolution;record.updatedBy=new mongoose.Types.ObjectId(access!.scope.userId);await record.save({session});
  if(parsed.data.status&&parsed.data.status!==before)await SupportEvent.create([{tenantId:access!.scope.tenantId,caseId:record._id,actorId:access!.scope.userId,action:"status_changed",body:`${before} → ${parsed.data.status}`,metadata:{from:before,to:parsed.data.status}}],{session});
  if(parsed.data.note)await SupportEvent.create([{tenantId:access!.scope.tenantId,caseId:record._id,actorId:access!.scope.userId,action:"note_added",visibility:"private",body:parsed.data.note}],{session});
  if(parsed.data.reply)await SupportEvent.create([{tenantId:access!.scope.tenantId,caseId:record._id,actorId:access!.scope.userId,action:"staff_reply",visibility:"customer",body:parsed.data.reply}],{session});
  await AuditEvent.create([{tenantId:access!.scope.tenantId,actorId:access!.scope.userId,action:"support.case_updated",entityType:"support_case",entityId:String(record._id),requestId:randomBytes(12).toString("hex"),metadata:{from:before,to:record.status,noteAdded:Boolean(parsed.data.note),customerReplySent:Boolean(parsed.data.reply)}}],{session});output=record.toObject();
 })}catch(error){if(error instanceof Error&&error.message==="CASE_NOT_FOUND")return NextResponse.json({error:"Case not found."},{status:404});return fail(error)}finally{await session.endSession()}
 return NextResponse.json({case:output},{headers:{"Cache-Control":"private, no-store"}});
}
