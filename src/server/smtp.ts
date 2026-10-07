import {lookup as dnsLookup} from "node:dns/promises";
import {isIP} from "node:net";
import nodemailer from "nodemailer";
import type SMTPTransport = require("nodemailer/lib/smtp-transport");

export type SmtpConfig={host:string;port:465|587;secure:boolean;username:string;password:string;fromName:string;fromEmail:string};
type ResolvedAddress={address:string;family:number};
export function isPublicSmtpAddress(address:string):boolean{
 const family=isIP(address);
 if(family===4){
  const octets=address.split(".").map(Number),[a,b]=octets;
  if(!octets.every(value=>Number.isInteger(value)&&value>=0&&value<=255))return false;
  return !(a===0||a===10||a===127||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&((b===0&&(octets[2]===0||octets[2]===2))||b===88&&octets[2]===99||b===168))||(a===198&&(b===18||b===19||b===51))||(a===203&&b===0&&octets[2]===113)||a>=224);
 }
 if(family===6){
  const value=address.toLowerCase();
  if(value.startsWith("::ffff:")){const mapped=value.slice(7);return isIP(mapped)===4&&isPublicSmtpAddress(mapped)}
  const first=Number.parseInt(value.split(":")[0]||"0",16);
  const second=Number.parseInt(value.split(":")[1]||"0",16);
  return first>=0x2000&&first<=0x3fff&&!(first===0x2001&&second<=0x01ff)&&!value.startsWith("2001:db8:")&&!value.startsWith("2002:");
 }
 return false;
}

export async function resolvePublicSmtpHost(host:string,resolver:(hostname:string)=>Promise<ResolvedAddress[]>=hostname=>dnsLookup(hostname,{all:true,verbatim:true})){
 const normalized=host.trim().toLowerCase().replace(/\.$/,"");
 if(!normalized||normalized.length>253||isIP(normalized)||!normalized.includes(".")||normalized.split(".").some(label=>!(/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))))throw new Error("SMTP_HOST_INVALID");
 if(["localhost","local","internal","test","example","invalid"].some(suffix=>normalized===suffix||normalized.endsWith(`.${suffix}`)))throw new Error("SMTP_HOST_INVALID");
 let addresses:ResolvedAddress[];
 try{addresses=await resolver(normalized)}catch{throw new Error("SMTP_HOST_UNRESOLVED")}
 if(addresses.length===0)throw new Error("SMTP_HOST_UNRESOLVED");
 if(addresses.some(({address})=>!isPublicSmtpAddress(address)))throw new Error("SMTP_HOST_PRIVATE");
 return {host:addresses[0].address,servername:normalized};
}

export type SmtpTransportOptions=SMTPTransport.Options;
type SmtpTransportClient={verify:()=>Promise<unknown>;sendMail:(message:SMTPTransport.MailOptions)=>Promise<Pick<SMTPTransport.SentMessageInfo,"messageId"|"accepted">>;close:()=>void};
export type SmtpVerifierDependencies={resolve?:(host:string)=>Promise<{host:string;servername:string}>;createTransport?:(options:SmtpTransportOptions)=>SmtpTransportClient};
async function createVerifiedDestinationTransport(config:SmtpConfig,dependencies:SmtpVerifierDependencies){
 const destination=await (dependencies.resolve??resolvePublicSmtpHost)(config.host);
 return (dependencies.createTransport??nodemailer.createTransport)({host:destination.host,port:config.port,secure:config.secure,requireTLS:!config.secure,auth:{user:config.username,pass:config.password},tls:{servername:destination.servername,minVersion:"TLSv1.2"},connectionTimeout:8000,greetingTimeout:8000,socketTimeout:10000,dnsTimeout:4000,disableFileAccess:true,disableUrlAccess:true,maxRecipients:1});
}
export async function verifySmtpConnection(config:SmtpConfig,dependencies:SmtpVerifierDependencies={}){
 const transport=await createVerifiedDestinationTransport(config,dependencies);
 try{await transport.verify()}finally{transport.close()}
}
export async function sendSmtpMessage(config:SmtpConfig,message:{to:string;subject:string;text:string;html:string;messageId?:string},dependencies:SmtpVerifierDependencies={}){
 const transport=await createVerifiedDestinationTransport(config,dependencies);
 try{return await transport.sendMail({from:{name:config.fromName,address:config.fromEmail},to:message.to,subject:message.subject,text:message.text,html:message.html,...(message.messageId?{messageId:message.messageId}:{})})}finally{transport.close()}
}
