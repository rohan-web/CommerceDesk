import {connectDatabase} from "./db.ts";
import {EmailDelivery} from "./models/EmailDelivery.ts";
import {PasswordResetToken} from "./models/PasswordResetToken.ts";
import mongoose from "mongoose";
import {newSessionToken,hashSessionToken} from "./secrets.ts";
import {SmtpConnection} from "./models/SmtpConnection.ts";
import {Tenant} from "./models/Tenant.ts";
import {decryptSecret,encryptSecret,hasValidEncryptionKey} from "./secrets.ts";
import {renderTeamInvitationEmail,renderPasswordResetEmail,type TeamInvitationEmail,type PasswordResetEmail} from "./email-templates.ts";
import {emailRetryDelayMs} from "./email-retry.ts";
import {sendSmtpMessage,type SmtpConfig} from "./smtp.ts";

type QueuedInvite={tenantId:string;recipient:string;tenantName:string;role:string;acceptUrl:string;expiresAt:Date;dedupeKey:string};
export async function queueTeamInvitationEmail(input:QueuedInvite){
 await connectDatabase();if(!hasValidEncryptionKey())throw new Error("EMAIL_ENCRYPTION_KEY_UNAVAILABLE");
 const connection=await SmtpConnection.exists({tenantId:input.tenantId,status:"verified"});if(!connection)return null;
 const payload:TeamInvitationEmail={tenantName:input.tenantName,role:input.role,acceptUrl:input.acceptUrl,expiresAt:input.expiresAt.toISOString()};
 try{const delivery=await EmailDelivery.create({tenantId:input.tenantId,template:"team_invitation",recipient:input.recipient.toLowerCase(),dedupeKey:input.dedupeKey,payloadEncrypted:encryptSecret(JSON.stringify(payload)),status:"queued",attempts:0,nextAttemptAt:new Date()});return String(delivery._id)}catch(error){if((error as {code?:number})?.code===11000){const existing=await EmailDelivery.findOne({tenantId:input.tenantId,dedupeKey:input.dedupeKey}).select("_id").lean();if(existing)return String(existing._id)}throw error}
}

function providerErrorCode(error:unknown){
 const value=error as {code?:string;responseCode?:number};
 if(value?.code==="EAUTH")return"SMTP_AUTH_REJECTED";
 if(value?.code==="EDNS"||value?.code==="ENOTFOUND")return"SMTP_DNS_ERROR";
 if(value?.code==="ETIMEDOUT")return"SMTP_TIMEOUT";
 if(value?.code==="ECONNECTION"||value?.code==="ECONNRESET"||value?.code==="ECONNREFUSED")return"SMTP_CONNECTION_ERROR";
 if(typeof value?.responseCode==="number")return value.responseCode>=500?"SMTP_SERVER_REJECTED":"SMTP_TEMPORARY_REJECTION";
 return"SMTP_DELIVERY_ERROR";
}
function isPermanent(error:unknown){const value=error as {code?:string;responseCode?:number};return value?.code==="EAUTH"||value?.code==="EENVELOPE"||(typeof value?.responseCode==="number"&&value.responseCode>=500)}
async function deliverOne(deliveryId:string,now=new Date(),send=sendSmtpMessage){
 const staleAt=new Date(now.getTime()-10*60_000);
 const delivery=await EmailDelivery.findOneAndUpdate({_id:deliveryId,attempts:{$lt:5},$or:[{status:"queued",nextAttemptAt:{$lte:now}},{status:"sending",lockedAt:{$lte:staleAt}}]},{$set:{status:"sending",lockedAt:now},$inc:{attempts:1}},{new:true}).select("+payloadEncrypted").lean();
 if(!delivery)return false;
 let failureCode="SMTP_DELIVERY_ERROR",permanent=false;
 try{
  if(delivery.template!=="team_invitation"&&delivery.template!=="password_reset")throw Object.assign(new Error("EMAIL_TEMPLATE_UNSUPPORTED"),{permanent:true,publicCode:"EMAIL_TEMPLATE_UNSUPPORTED"});
  const payload=JSON.parse(decryptSecret(delivery.payloadEncrypted)) as TeamInvitationEmail&PasswordResetEmail;
  if(new Date(payload.expiresAt).getTime()<=now.getTime())throw Object.assign(new Error("EMAIL_LINK_EXPIRED"),{permanent:true,publicCode:"EMAIL_LINK_EXPIRED"});
  const [connection,tenant]=await Promise.all([SmtpConnection.findOne({tenantId:delivery.tenantId,status:"verified"}).select("+passwordEncrypted").lean(),delivery.template==="team_invitation"?Tenant.findById(delivery.tenantId).select("name").lean():Promise.resolve(null)]);
  if(!connection)throw Object.assign(new Error("SMTP_NOT_CONFIGURED"),{permanent:true,publicCode:"SMTP_NOT_CONFIGURED"});
  if(delivery.template==="team_invitation"&&!tenant)throw Object.assign(new Error("EMAIL_WORKSPACE_MISSING"),{permanent:true,publicCode:"EMAIL_WORKSPACE_MISSING"});
  const email=delivery.template==="team_invitation"?renderTeamInvitationEmail({...payload as TeamInvitationEmail,tenantName:tenant!.name}):renderPasswordResetEmail(payload as PasswordResetEmail);
  const config:SmtpConfig={host:connection.host,port:connection.port as 465|587,secure:connection.secure,username:connection.username,password:decryptSecret(connection.passwordEncrypted),fromName:connection.fromName,fromEmail:connection.fromEmail};
  const result=await send(config,{to:delivery.recipient,...email,messageId:`<${delivery.template==="team_invitation"?"invite":"password-reset"}-${String(delivery._id)}@commercedesk.invalid>`});
  const recipientAccepted=result.accepted.some(address=>address.toLowerCase()===delivery.recipient.toLowerCase());if(!recipientAccepted)throw Object.assign(new Error("SMTP_RECIPIENT_REJECTED"),{permanent:true,publicCode:"SMTP_RECIPIENT_REJECTED"});
  await EmailDelivery.updateOne({_id:delivery._id,status:"sending",attempts:delivery.attempts},{$set:{status:"sent",sentAt:new Date(),lockedAt:null,providerMessageId:result.messageId||null,lastErrorCode:null}});return true;
 }catch(error){const detail=error as {permanent?:boolean;publicCode?:string};permanent=detail.permanent===true||isPermanent(error);failureCode=detail.publicCode||providerErrorCode(error);
  const attempts=delivery.attempts,exhausted=permanent||attempts>=5;await EmailDelivery.updateOne({_id:delivery._id,status:"sending",attempts},{$set:{status:exhausted?"failed":"queued",lockedAt:null,lastErrorCode:failureCode,nextAttemptAt:exhausted?now:new Date(now.getTime()+emailRetryDelayMs(attempts))}});return false
 }
}

export async function sweepEmailDeliveries(limit=12,dependencies:{now?:Date;send?:typeof sendSmtpMessage}={}){
 await connectDatabase();const now=dependencies.now??new Date(),staleAt=new Date(now.getTime()-10*60_000);
 await EmailDelivery.updateMany({status:"sending",lockedAt:{$lte:staleAt},attempts:{$gte:5}},{$set:{status:"failed",lockedAt:null,lastErrorCode:"SMTP_WORKER_INTERRUPTED",nextAttemptAt:now}});
 const due=await EmailDelivery.find({attempts:{$lt:5},$or:[{status:"queued",nextAttemptAt:{$lte:now}},{status:"sending",lockedAt:{$lte:staleAt}}]}).select("_id").sort({nextAttemptAt:1,createdAt:1}).limit(Math.max(1,Math.min(50,limit))).lean();
 for(const item of due){try{const sent=await deliverOne(String(item._id),now,dependencies.send??sendSmtpMessage);if(!sent)console.warn(JSON.stringify({level:"warn",event:"tenant_email_delivery_failed",deliveryId:String(item._id)}))}catch(error){console.error(JSON.stringify({level:"error",event:"tenant_email_sweep_item_failed",deliveryId:String(item._id),error:error instanceof Error?error.name:"UNKNOWN_ERROR"}))}}
}

export async function queuePasswordResetEmail(input:{userId:string;tenantId:string;recipient:string}){
 await connectDatabase();if(!hasValidEncryptionKey())throw new Error("EMAIL_ENCRYPTION_KEY_UNAVAILABLE");
 const connection=await SmtpConnection.exists({tenantId:input.tenantId,status:"verified"});if(!connection)return false;
 const token=newSessionToken(),now=new Date(),expiresAt=new Date(now.getTime()+30*60_000),resetUrl=new URL("/reset-password",process.env.APP_URL).toString()+`#${token}`;
 const payload:PasswordResetEmail={resetUrl,expiresAt:expiresAt.toISOString()},session=await mongoose.startSession();
 try{await session.withTransaction(async()=>{await PasswordResetToken.updateMany({userId:input.userId,usedAt:null},{$set:{usedAt:now}},{session});await PasswordResetToken.create([{userId:input.userId,tokenHash:hashSessionToken(token),expiresAt}],{session});await EmailDelivery.create([{tenantId:input.tenantId,template:"password_reset",recipient:input.recipient.toLowerCase(),dedupeKey:`password-reset:${hashSessionToken(token)}`,payloadEncrypted:encryptSecret(JSON.stringify(payload)),status:"queued",attempts:0,nextAttemptAt:now}],{session})})}finally{await session.endSession()}return true;
}
