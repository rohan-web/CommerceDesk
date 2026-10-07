import {randomBytes} from "node:crypto";
import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {requireTenantAccess} from "@/server/tenant-scope";
import {isSameOrigin} from "@/server/request-security";
import {WorkOrder} from "@/server/models/WorkOrder";
import {WorkOrderAttachment} from "@/server/models/WorkOrderAttachment";
import {AuditEvent} from "@/server/models/AuditEvent";
import {detectPrivateEvidenceType,MAX_PRIVATE_FILE_BYTES,privateFileHash,removePrivateEvidence,safePrivateFileName,writePrivateEvidence} from "@/server/private-files";

type Context={params:Promise<{id:string}>};
const MAX_BODY_BYTES=MAX_PRIVATE_FILE_BYTES+64*1024;
async function readLimitedBody(request:Request){
 if(!request.body)return null;
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY_BYTES){await reader.cancel();return null}chunks.push(value)}}finally{reader.releaseLock()}
 const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength}return body;
}
function unavailable(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"You do not have permission to attach work-order files."},{status:403});return NextResponse.json({error:"Work-order files are temporarily unavailable."},{status:503})}

export async function POST(request:Request,context:Context){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
 const {id}=await context.params;if(!mongoose.isValidObjectId(id))return NextResponse.json({error:"Work order not found."},{status:404});
 const contentType=request.headers.get("content-type")||"";if(!contentType.toLowerCase().startsWith("multipart/form-data;"))return NextResponse.json({error:"Choose a PDF, PNG, JPEG, or WebP file."},{status:415});
 const contentLength=request.headers.get("content-length");if(contentLength!==null){const declaredLength=Number(contentLength);if(!Number.isSafeInteger(declaredLength)||declaredLength<1)return NextResponse.json({error:"The upload size could not be verified."},{status:400});if(declaredLength>MAX_BODY_BYTES)return NextResponse.json({error:"Files must be 10 MB or smaller."},{status:413})}
 let access;try{access=await requireTenantAccess("workorders:write")}catch(error){return unavailable(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 let body:Uint8Array|null;try{body=await readLimitedBody(request)}catch{return NextResponse.json({error:"The upload could not be read."},{status:400})}if(!body)return NextResponse.json({error:"Files must be 10 MB or smaller."},{status:413});
 let form:FormData;try{form=await new Request(request.url,{method:"POST",headers:{"content-type":contentType},body:body as BodyInit}).formData()}catch{return NextResponse.json({error:"Choose a valid file and try again."},{status:400})}
 const file=form.get("file"),purpose=form.get("purpose");if(!(file instanceof File)||!file.size||file.size>MAX_PRIVATE_FILE_BYTES)return NextResponse.json({error:"Choose a file between 1 byte and 10 MB."},{status:413});if(purpose!=="supporting"&&purpose!=="completion_evidence")return NextResponse.json({error:"Choose a file purpose."},{status:400});
 let bytes:Uint8Array;try{bytes=new Uint8Array(await file.arrayBuffer())}catch{return NextResponse.json({error:"The file could not be read."},{status:400})}const detected=detectPrivateEvidenceType(bytes);if(!detected)return NextResponse.json({error:"Only PDF, PNG, JPEG, and WebP files are accepted."},{status:415});
 let storage:{storageKey:string;path:string}|null=null;
 try{
  const workOrder=await WorkOrder.findOne({_id:id,tenantId:access.scope.tenantId}).select("_id assigneeId status orderNumber serviceName").lean();if(!workOrder)return NextResponse.json({error:"Work order not found."},{status:404});if(access.scope.role!=="owner"&&String(workOrder.assigneeId)!==access.scope.userId)return NextResponse.json({error:"This work order is assigned to another operator."},{status:403});if(workOrder.status==="cancelled")return NextResponse.json({error:"Files cannot be added to a cancelled work order."},{status:409});
  storage=await writePrivateEvidence(bytes,detected);
  const session=await mongoose.startSession();let attachmentId="";
  try{await session.withTransaction(async()=>{
   const current=await WorkOrder.findOneAndUpdate({_id:id,tenantId:access!.scope.tenantId,status:{$ne:"cancelled"},...(access!.scope.role==="owner"?{}:{assigneeId:access!.scope.userId}),$or:[{attachmentCount:{$lt:20}},{attachmentCount:{$exists:false}}]},{$inc:{attachmentCount:1,version:1}},{new:true,session}).select("_id").lean();
   if(!current){const exists=await WorkOrder.findOne({_id:id,tenantId:access!.scope.tenantId}).select("assigneeId status attachmentCount").session(session).lean();if(!exists)throw new Error("WORK_ORDER_NOT_FOUND");if(access!.scope.role!=="owner"&&String(exists.assigneeId)!==access!.scope.userId)throw new Error("WORK_ORDER_NOT_ASSIGNED");if(exists.status==="cancelled")throw new Error("WORK_ORDER_CANCELLED");if((exists.attachmentCount||0)>=20)throw new Error("ATTACHMENT_LIMIT");throw new Error("ATTACHMENT_RESERVATION_FAILED")}
   const [attachment]=await WorkOrderAttachment.create([{tenantId:access!.scope.tenantId,workOrderId:workOrder._id,storageKey:storage!.storageKey,originalName:safePrivateFileName(file.name),contentType:detected,sizeBytes:bytes.byteLength,sha256:privateFileHash(bytes),purpose,uploadedBy:access!.scope.userId}],{session});attachmentId=String(attachment._id);
   await AuditEvent.create([{tenantId:access!.scope.tenantId,actorId:access!.scope.userId,action:"work_order.attachment_added",entityType:"work_order",entityId:id,requestId:randomBytes(12).toString("hex"),metadata:{attachmentId,purpose,contentType:detected,sizeBytes:bytes.byteLength}}],{session});
  })}finally{await session.endSession()}
  return NextResponse.json({attachment:{id:attachmentId,name:safePrivateFileName(file.name),contentType:detected,sizeBytes:bytes.byteLength,purpose}},{status:201,headers:{"Cache-Control":"private, no-store"}})
 }catch(error){if(storage)await removePrivateEvidence(storage.storageKey,detected).catch(()=>{});if(error instanceof Error&&error.message==="WORK_ORDER_NOT_FOUND")return NextResponse.json({error:"Work order not found."},{status:404});if(error instanceof Error&&error.message==="WORK_ORDER_NOT_ASSIGNED")return NextResponse.json({error:"This work order is assigned to another operator."},{status:403});if(error instanceof Error&&(error.message==="WORK_ORDER_CANCELLED"||error.message==="ATTACHMENT_LIMIT"))return NextResponse.json({error:error.message==="ATTACHMENT_LIMIT"?"This work order has reached its 20-file limit.":"Files cannot be added to a cancelled work order."},{status:409});return unavailable(error)}
}
