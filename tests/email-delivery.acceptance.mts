import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import mongoose from "mongoose";
import {connectDatabase} from "../src/server/db.ts";
import {EmailDelivery} from "../src/server/models/EmailDelivery.ts";
import {SmtpConnection} from "../src/server/models/SmtpConnection.ts";
import {Tenant} from "../src/server/models/Tenant.ts";
import {encryptSecret} from "../src/server/secrets.ts";
import {queueTeamInvitationEmail,sweepEmailDeliveries} from "../src/server/email-delivery.ts";

function assertDisposableUri(uri:string){const parsed=new URL(uri);assert.ok(["127.0.0.1","localhost","::1"].includes(parsed.hostname),"MONGODB_TEST_URI must use loopback; refusing a remote database");assert.match(parsed.pathname,/_test(?:$|\?)/i,"MONGODB_TEST_URI database name must include _test")}
async function run(){
 const uri=process.env.MONGODB_TEST_URI;if(!uri)throw new Error("Set MONGODB_TEST_URI to a disposable loopback MongoDB database whose name includes _test.");assertDisposableUri(uri);process.env.MONGODB_URI=uri;process.env.APP_ENCRYPTION_KEY=randomBytes(32).toString("base64url");await connectDatabase();
 const suffix=`${Date.now()}-${randomUUID().slice(0,8)}`,tenantName=`Email Outbox Acceptance ${suffix}`,slug=`email-test-${suffix.toLowerCase()}`,now=new Date(Date.now()+1000);let tenantId:string|undefined;let delivered=0;
 try{
  const tenant=await Tenant.create({name:tenantName,slug,deploymentMode:"standalone",commerceMode:"native",baseCurrency:"USD",timezone:"UTC"});tenantId=String(tenant._id);
  await SmtpConnection.create({tenantId,host:"smtp.example.com",port:587,secure:false,username:"sender@example.com",passwordEncrypted:encryptSecret("test-app-password"),fromName:"Example shop",fromEmail:"orders@example.com",status:"verified",lastVerifiedAt:now});
  const acceptUrl=`http://127.0.0.1:3019/invite/${randomBytes(32).toString("base64url")}`,deliveryId=await queueTeamInvitationEmail({tenantId,recipient:"new-member@example.net",tenantName,role:"sales",acceptUrl,expiresAt:new Date(now.getTime()+48*60*60_000),dedupeKey:"team-invite:acceptance-transient"});assert.ok(deliveryId);
  let row=await EmailDelivery.findById(deliveryId).select("+payloadEncrypted").lean();assert.ok(row);assert.equal(row.status,"queued");assert.equal(row.payloadEncrypted.includes(acceptUrl),false,"the private invitation URL must be encrypted in the outbox");
  const send=async(_config:unknown,message:{to:string;subject:string;html:string;messageId?:string})=>{delivered++;assert.equal(message.to,"new-member@example.net");assert.match(message.html,/Accept invitation/);if(delivered===1)throw Object.assign(new Error("Temporary network timeout"),{code:"ETIMEDOUT"});return{messageId:"smtp-accepted-message-id",accepted:[message.to]}};
  await sweepEmailDeliveries(12,{now,send:send as never});row=await EmailDelivery.findById(deliveryId).lean();assert.equal(row?.status,"queued");assert.equal(row?.attempts,1);assert.equal(row?.lastErrorCode,"SMTP_TIMEOUT");assert.equal(row?.nextAttemptAt?.getTime(),now.getTime()+30_000);
  await sweepEmailDeliveries(12,{now:new Date(now.getTime()+30_001),send:send as never});row=await EmailDelivery.findById(deliveryId).lean();assert.equal(row?.status,"sent");assert.equal(row?.attempts,2);assert.equal(row?.providerMessageId,"smtp-accepted-message-id");assert.equal(row?.lastErrorCode,null);

  const failedId=await queueTeamInvitationEmail({tenantId,recipient:"bad-recipient@example.net",tenantName,role:"operations",acceptUrl,expiresAt:new Date(now.getTime()+48*60*60_000),dedupeKey:"team-invite:acceptance-rejected"});assert.ok(failedId);
  await sweepEmailDeliveries(12,{now,send:(async(_config:unknown,message:{to:string})=>({messageId:"smtp-rejected-message",accepted:[]})) as never});let failed=await EmailDelivery.findById(failedId).lean();assert.equal(failed?.status,"failed");assert.equal(failed?.lastErrorCode,"SMTP_RECIPIENT_REJECTED");
  await EmailDelivery.updateOne({_id:failedId,tenantId,status:"failed"},{$set:{status:"queued",attempts:0,nextAttemptAt:now,lastErrorCode:null}});await sweepEmailDeliveries(12,{now,send:(async(_config:unknown,message:{to:string})=>({messageId:"smtp-retry-message",accepted:[message.to]})) as never});failed=await EmailDelivery.findById(failedId).lean();assert.equal(failed?.status,"sent");assert.equal(failed?.attempts,1);

  const staleId=await queueTeamInvitationEmail({tenantId,recipient:"recovered@example.net",tenantName,role:"support",acceptUrl,expiresAt:new Date(now.getTime()+48*60*60_000),dedupeKey:"team-invite:acceptance-stale"});assert.ok(staleId);await EmailDelivery.updateOne({_id:staleId},{$set:{status:"sending",attempts:1,lockedAt:new Date(now.getTime()-11*60_000)}});await sweepEmailDeliveries(12,{now,send:(async(_config:unknown,message:{to:string})=>({messageId:"smtp-recovered-message",accepted:[message.to]})) as never});const stale=await EmailDelivery.findById(staleId).lean();assert.equal(stale?.status,"sent");assert.equal(stale?.attempts,2);

  console.log("EMAIL_DELIVERY_ACCEPTANCE_OK: encrypted invitation payload, transient retry, accepted/rejected recipient handling, owner-retry state, and stale-worker recovery");
 }finally{if(tenantId){await EmailDelivery.deleteMany({tenantId});await SmtpConnection.deleteMany({tenantId});await Tenant.deleteOne({_id:tenantId})}await mongoose.disconnect()}
}
run().catch(error=>{console.error(error);process.exitCode=1});
