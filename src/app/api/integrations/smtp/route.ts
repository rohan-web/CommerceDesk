import {randomBytes} from "node:crypto";
import {NextResponse} from "next/server";
import {z} from "zod";
import {requireTenantAccess} from "@/server/tenant-scope";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import {SmtpConnection} from "@/server/models/SmtpConnection";
import {AuditEvent} from "@/server/models/AuditEvent";
import {decryptSecret,encryptSecret,hasValidEncryptionKey} from "@/server/secrets";
import {verifySmtpConnection,type SmtpConfig} from "@/server/smtp";
import {consumeSmtpVerificationAttempt} from "@/server/rate-limit";
import {EmailDelivery} from "@/server/models/EmailDelivery";

export const dynamic="force-dynamic";
const schema=z.object({host:z.string().trim().min(3).max(253),port:z.union([z.literal(465),z.literal(587)]),secure:z.boolean(),username:z.string().trim().min(1).max(254),password:z.string().max(512).optional(),fromName:z.string().trim().min(1).max(120),fromEmail:z.string().trim().email().max(254)}).strict().superRefine((value,context)=>{if((value.port===465)!==value.secure)context.addIssue({code:"custom",path:["secure"],message:"Use TLS on port 465 and STARTTLS on port 587."})});
function fail(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"Only workspace owners can manage email integrations."},{status:403});return NextResponse.json({error:"Email integration is temporarily unavailable."},{status:503})}
function hostError(error:unknown){if(!(error instanceof Error))return false;if(error.message==="SMTP_HOST_INVALID")return NextResponse.json({error:"Enter a valid public SMTP hostname; private or local network addresses are not allowed."},{status:400});if(error.message==="SMTP_HOST_PRIVATE")return NextResponse.json({error:"The SMTP hostname resolves to a private or reserved network address."},{status:400});if(error.message==="SMTP_HOST_UNRESOLVED")return NextResponse.json({error:"The SMTP hostname could not be resolved. Check the hostname and try again."},{status:400});return null}
export async function GET(){
 let access;try{access=await requireTenantAccess("tenant:settings")}catch(error){return fail(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 try{const[connection,deliveries]=await Promise.all([SmtpConnection.findOne({tenantId:access.scope.tenantId}).select("host port secure username fromName fromEmail status lastVerifiedAt lastErrorCode updatedAt").lean(),EmailDelivery.find({tenantId:access.scope.tenantId}).select("template recipient status attempts nextAttemptAt sentAt lastErrorCode createdAt").sort({createdAt:-1}).limit(50).lean()]);return NextResponse.json({connection:connection?{host:connection.host,port:connection.port,secure:connection.secure,username:connection.username,fromName:connection.fromName,fromEmail:connection.fromEmail,status:connection.status,lastVerifiedAt:connection.lastVerifiedAt,lastErrorCode:connection.lastErrorCode,updatedAt:connection.updatedAt,passwordConfigured:true}:null,deliveries:deliveries.map(item=>({id:String(item._id),template:item.template,recipient:item.recipient,status:item.status,attempts:item.attempts,nextAttemptAt:item.nextAttemptAt,sentAt:item.sentAt,lastErrorCode:item.lastErrorCode,createdAt:item.createdAt}))},{headers:{"Cache-Control":"private, no-store"}})}catch(error){return fail(error)}
}
export async function POST(request:Request){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});let access;try{access=await requireTenantAccess("tenant:settings")}catch(error){return fail(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 try{if(await consumeSmtpVerificationAttempt(access.scope.tenantId)>8)return NextResponse.json({error:"Too many SMTP checks were requested. Try again in 15 minutes."},{status:429})}catch{return NextResponse.json({error:"Email verification is temporarily unavailable."},{status:503})}
 if(!hasValidEncryptionKey())return NextResponse.json({error:"Set a valid APP_ENCRYPTION_KEY before saving email credentials."},{status:503});
 const body=await readJsonLimited(request,12000);if(body.kind!=="ok")return NextResponse.json({error:body.kind==="too-large"?"Request is too large.":"Request body is invalid."},{status:body.kind==="too-large"?413:400});const parsed=schema.safeParse(body.value);if(!parsed.success)return NextResponse.json({error:"Enter a valid SMTP hostname, port, sender, and TLS mode."},{status:400});
 try{
  const existing=await SmtpConnection.findOne({tenantId:access.scope.tenantId}).select("+passwordEncrypted").lean();let password=parsed.data.password?.trim()||"";
  if(!password&&existing)password=decryptSecret(existing.passwordEncrypted);if(!password)return NextResponse.json({error:"Enter the SMTP password or app password."},{status:400});
  const config:SmtpConfig={...parsed.data,password,host:parsed.data.host.toLowerCase(),fromEmail:parsed.data.fromEmail.toLowerCase()};
  try{await verifySmtpConnection(config)}catch(error){const blocked=hostError(error);if(blocked)return blocked;return NextResponse.json({error:"The SMTP server could not be verified. Check the host, port, TLS mode, username, and app password."},{status:400})}
  const now=new Date();await SmtpConnection.findOneAndUpdate({tenantId:access.scope.tenantId},{$set:{host:config.host,port:config.port,secure:config.secure,username:config.username,passwordEncrypted:encryptSecret(password),fromName:config.fromName,fromEmail:config.fromEmail,status:"verified",lastVerifiedAt:now,lastErrorCode:null},$setOnInsert:{tenantId:access.scope.tenantId}},{upsert:true,new:true,runValidators:true});
  await AuditEvent.create({tenantId:access.scope.tenantId,actorId:access.scope.userId,action:"integration.smtp_verified",entityType:"integration",entityId:"smtp",requestId:randomBytes(12).toString("hex"),metadata:{host:config.host,port:config.port,secure:config.secure,fromEmail:config.fromEmail}});
  return NextResponse.json({connection:{host:config.host,port:config.port,secure:config.secure,username:config.username,fromName:config.fromName,fromEmail:config.fromEmail,status:"verified",lastVerifiedAt:now,passwordConfigured:true}},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return fail(error)}
}
export async function DELETE(request:Request){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});let access;try{access=await requireTenantAccess("tenant:settings")}catch(error){return fail(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 try{if(await EmailDelivery.exists({tenantId:access.scope.tenantId,status:{$in:["queued","sending"]}}))return NextResponse.json({error:"Wait for queued emails to finish or fail before disconnecting SMTP."},{status:409});const connection=await SmtpConnection.findOneAndDelete({tenantId:access.scope.tenantId}).select("host").lean();if(connection)await AuditEvent.create({tenantId:access.scope.tenantId,actorId:access.scope.userId,action:"integration.smtp_disconnected",entityType:"integration",entityId:"smtp",requestId:randomBytes(12).toString("hex"),metadata:{host:connection.host}});return NextResponse.json({disconnected:true},{headers:{"Cache-Control":"private, no-store"}})}catch(error){return fail(error)}
}
