import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {randomBytes} from "node:crypto";
import {isSameOrigin} from "@/server/request-security";
import {requireTenantAccess} from "@/server/tenant-scope";
import {WorkOrder} from "@/server/models/WorkOrder";
import {WorkOrderAttachment} from "@/server/models/WorkOrderAttachment";
import {AuditEvent} from "@/server/models/AuditEvent";
import {privateFileHash,readPrivateEvidence,removePrivateEvidence,type PrivateEvidenceType} from "@/server/private-files";

type Context={params:Promise<{id:string;attachmentId:string}>};
function unavailable(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"You do not have permission to view work-order files."},{status:403});return NextResponse.json({error:"Work-order files are temporarily unavailable."},{status:503})}

export async function GET(_request:Request,context:Context){
 const {id,attachmentId}=await context.params;if(!mongoose.isValidObjectId(id)||!mongoose.isValidObjectId(attachmentId))return NextResponse.json({error:"File not found."},{status:404});
 let access;try{access=await requireTenantAccess("workorders:read")}catch(error){return unavailable(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 try{
  const attachment=await WorkOrderAttachment.findOne({_id:attachmentId,workOrderId:id,tenantId:access.scope.tenantId,status:"ready"}).lean();if(!attachment)return NextResponse.json({error:"File not found."},{status:404});
  const workOrder=await WorkOrder.findOne({_id:id,tenantId:access.scope.tenantId}).select("assigneeId").lean();if(!workOrder)return NextResponse.json({error:"File not found."},{status:404});if(access.scope.role!=="owner"&&String(workOrder.assigneeId)!==access.scope.userId)return NextResponse.json({error:"This work order is assigned to another operator."},{status:403});
  const bytes=await readPrivateEvidence(attachment.storageKey,attachment.contentType as PrivateEvidenceType);if(privateFileHash(bytes)!==attachment.sha256)return NextResponse.json({error:"The stored file failed its integrity check."},{status:503});const name=encodeURIComponent(attachment.originalName).replace(/['()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return new NextResponse(new Uint8Array(bytes),{headers:{"Content-Type":attachment.contentType,"Content-Length":String(bytes.byteLength),"Content-Disposition":`attachment; filename*=UTF-8''${name}`,"X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store","Content-Security-Policy":"sandbox"}})
 }catch(error){return unavailable(error)}
}

export async function DELETE(request:Request,context:Context){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
 const {id,attachmentId}=await context.params;if(!mongoose.isValidObjectId(id)||!mongoose.isValidObjectId(attachmentId))return NextResponse.json({error:"File not found."},{status:404});
 let access;try{access=await requireTenantAccess("workorders:write")}catch(error){return unavailable(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
  let removed:{storageKey:string;contentType:PrivateEvidenceType}|undefined;
 try{
  const session=await mongoose.startSession();try{removed=await session.withTransaction(async()=>{
   const workOrder=await WorkOrder.findOne({_id:id,tenantId:access!.scope.tenantId}).select("assigneeId").session(session).lean();if(!workOrder)throw new Error("WORK_ORDER_NOT_FOUND");if(access!.scope.role!=="owner"&&String(workOrder.assigneeId)!==access!.scope.userId)throw new Error("WORK_ORDER_NOT_ASSIGNED");
   const attachment=await WorkOrderAttachment.findOne({_id:attachmentId,workOrderId:id,tenantId:access!.scope.tenantId,status:"ready"}).session(session);if(!attachment)throw new Error("ATTACHMENT_NOT_FOUND");
   const counter=await WorkOrder.updateOne({_id:id,tenantId:access!.scope.tenantId,attachmentCount:{$gte:1}},{$inc:{attachmentCount:-1,version:1}},{session});if(!counter.matchedCount)throw new Error("ATTACHMENT_COUNTER_INVALID");
    attachment.status="deleted";attachment.deletedAt=new Date();await attachment.save({session});
   await AuditEvent.create([{tenantId:access!.scope.tenantId,actorId:access!.scope.userId,action:"work_order.attachment_removed",entityType:"work_order",entityId:id,requestId:randomBytes(12).toString("hex"),metadata:{attachmentId,purpose:attachment.purpose,sizeBytes:attachment.sizeBytes}}],{session});
    return {storageKey:attachment.storageKey,contentType:attachment.contentType as PrivateEvidenceType};
  })}finally{await session.endSession()}
 }catch(error){if(error instanceof Error&&error.message==="WORK_ORDER_NOT_FOUND")return NextResponse.json({error:"Work order not found."},{status:404});if(error instanceof Error&&error.message==="ATTACHMENT_NOT_FOUND")return NextResponse.json({error:"File not found."},{status:404});if(error instanceof Error&&error.message==="WORK_ORDER_NOT_ASSIGNED")return NextResponse.json({error:"This work order is assigned to another operator."},{status:403});if(error instanceof Error&&error.message==="ATTACHMENT_COUNTER_INVALID")return unavailable(error);return unavailable(error)}
 if(removed){try{await removePrivateEvidence(removed.storageKey,removed.contentType);await WorkOrderAttachment.deleteOne({tenantId:access.scope.tenantId,workOrderId:id,storageKey:removed.storageKey,status:"deleted"})}catch{/* the worker retries persisted deletions */}}
 return NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
}
