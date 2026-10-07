import assert from "node:assert/strict";
import test from "node:test";
import {isPublicSmtpAddress,resolvePublicSmtpHost,sendSmtpMessage,verifySmtpConnection} from "../src/server/smtp.ts";

const config={host:"smtp.example.com",port:587 as const,secure:false,username:"mailer@example.com",password:"private-app-password",fromName:"Store",fromEmail:"orders@example.com"};

test("SMTP host guard accepts public addresses and blocks local/reserved ranges",()=>{
 for(const address of ["8.8.8.8","1.1.1.1","2606:4700:4700::1111"])assert.equal(isPublicSmtpAddress(address),true,address);
 for(const address of ["0.1.2.3","10.0.0.1","100.64.0.1","127.0.0.1","169.254.1.2","172.16.0.1","192.0.0.8","192.0.2.5","192.88.99.4","192.168.1.4","198.18.0.2","198.51.100.4","203.0.113.9","224.0.0.1","::1","fc00::1","fe80::1","2001:db8::4","2001:20::1","::ffff:127.0.0.1"])assert.equal(isPublicSmtpAddress(address),false,address);
});

test("SMTP DNS validation rejects literal, local, and mixed private DNS results",async()=>{
 await assert.rejects(resolvePublicSmtpHost("127.0.0.1",async()=>[{address:"127.0.0.1",family:4}]),{message:"SMTP_HOST_INVALID"});
 await assert.rejects(resolvePublicSmtpHost("mail.localhost",async()=>[{address:"8.8.8.8",family:4}]),{message:"SMTP_HOST_INVALID"});
 await assert.rejects(resolvePublicSmtpHost("smtp.example.com",async()=>[{address:"8.8.8.8",family:4},{address:"10.1.2.3",family:4}]),{message:"SMTP_HOST_PRIVATE"});
 await assert.rejects(resolvePublicSmtpHost("smtp.example.com",async()=>[]),{message:"SMTP_HOST_UNRESOLVED"});
});

test("SMTP verification pins the resolved public IP and requires TLS without exposing secrets",async()=>{
 let sentOptions:Record<string,unknown>|undefined,closed=false;
 await verifySmtpConnection(config,{resolve:async()=>({host:"8.8.8.8",servername:"smtp.example.com"}),createTransport:(options)=>{sentOptions=options as Record<string,unknown>;return{verify:async()=>true,sendMail:async()=>({messageId:"test",accepted:[]}),close:()=>{closed=true}}}});
 assert.equal(sentOptions?.host,"8.8.8.8");assert.equal(sentOptions?.requireTLS,true);assert.deepEqual(sentOptions?.tls,{servername:"smtp.example.com",minVersion:"TLSv1.2"});assert.deepEqual(sentOptions?.auth,{user:config.username,pass:config.password});assert.equal(closed,true);
});

test("SMTP transport closes even if authentication verification fails",async()=>{
 let closed=false;
 await assert.rejects(verifySmtpConnection(config,{resolve:async()=>({host:"8.8.8.8",servername:"smtp.example.com"}),createTransport:()=>({verify:async()=>{throw new Error("AUTHFAIL")},sendMail:async()=>({messageId:"test",accepted:[]}),close:()=>{closed=true}})}),/AUTHFAIL/);
 assert.equal(closed,true);
});

test("SMTP send pins the host, uses the configured sender, and closes transport",async()=>{
 let sent:Record<string,unknown>|undefined,closed=false;
 const result=await sendSmtpMessage(config,{to:"invitee@example.net",subject:"Join Store",text:"Accept here",html:"<p>Accept here</p>",messageId:"<delivery@commercedesk.invalid>"},{resolve:async()=>({host:"8.8.4.4",servername:"smtp.example.com"}),createTransport:(options)=>{assert.equal(options.host,"8.8.4.4");return{verify:async()=>true,sendMail:async(message)=>{sent=message as unknown as Record<string,unknown>;return{messageId:"<accepted@example.net>",accepted:["invitee@example.net"]}},close:()=>{closed=true}}}});
 assert.equal(sent?.to,"invitee@example.net");assert.deepEqual(sent?.from,{name:"Store",address:"orders@example.com"});assert.equal(sent?.messageId,"<delivery@commercedesk.invalid>");assert.equal(result.messageId,"<accepted@example.net>");assert.deepEqual(result.accepted,["invitee@example.net"]);assert.equal(closed,true);
});
