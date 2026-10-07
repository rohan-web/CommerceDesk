import {randomBytes} from "node:crypto";
import {NextResponse} from "next/server";
import {requireTenantAccess} from "@/server/tenant-scope";
import {isSameOrigin} from "@/server/request-security";
import {EmailDelivery} from "@/server/models/EmailDelivery";
import {AuditEvent} from "@/server/models/AuditEvent";

export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{deliveryId:string}>}){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
 let access;try{access=await requireTenantAccess("tenant:settings")}catch(error){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"Only workspace owners can retry email delivery."},{status:403});return NextResponse.json({error:"Email delivery is temporarily unavailable."},{status:503})}
 if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});const{deliveryId}=await params;if(!/^[a-f\d]{24}$/i.test(deliveryId))return NextResponse.json({error:"Email delivery record not found."},{status:404});
 try{const delivery=await EmailDelivery.findOneAndUpdate({_id:deliveryId,tenantId:access.scope.tenantId,status:"failed"},{$set:{status:"queued",attempts:0,nextAttemptAt:new Date(),lockedAt:null,sentAt:null,providerMessageId:null,lastErrorCode:null}},{new:true}).select("_id template recipient status attempts nextAttemptAt").lean();if(!delivery){const existing=await EmailDelivery.findOne({_id:deliveryId,tenantId:access.scope.tenantId}).select("status").lean();return NextResponse.json({error:existing?"Only failed emails can be retried.":"Email delivery record not found."},{status:existing?409:404})}await AuditEvent.create({tenantId:access.scope.tenantId,actorId:access.scope.userId,action:"integration.email_delivery_retried",entityType:"email_delivery",entityId:String(delivery._id),requestId:randomBytes(12).toString("hex"),metadata:{template:delivery.template}});return NextResponse.json({delivery:{id:String(delivery._id),status:delivery.status,attempts:delivery.attempts,nextAttemptAt:delivery.nextAttemptAt}},{headers:{"Cache-Control":"private, no-store"}})}catch{return NextResponse.json({error:"Email delivery could not be retried."},{status:503})}
}
