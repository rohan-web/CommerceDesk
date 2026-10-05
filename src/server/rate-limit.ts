import IORedis from "ioredis";
import {createHash} from "node:crypto";
const root=globalThis as typeof globalThis&{__cdRedis?:IORedis};
export function getRedis(){
 if(root.__cdRedis)return root.__cdRedis;
 const url=process.env.REDIS_URL;if(!url)throw new Error("REDIS_URL_REQUIRED");
 root.__cdRedis=new IORedis(url,{maxRetriesPerRequest:1,enableReadyCheck:true,connectTimeout:3000});return root.__cdRedis;
}
const limiterScript="local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end;return n";
export async function consumeLoginAttempt(normalizedEmail:string){
 const key=`auth:login:${normalizedEmail}`;return Number(await getRedis().eval(limiterScript,1,key,15*60*1000));
}
export async function consumePublicCheckoutAttempt(tenantId:string,ipAddress:string){
 const identity=createHash("sha256").update(`${tenantId}:${ipAddress||"unknown"}`).digest("hex"),key=`store:checkout:${identity}`;return Number(await getRedis().eval(limiterScript,1,key,15*60*1000));
}
export async function consumePublicAppointmentAttempt(tenantId:string,ipAddress:string){
 const identity=createHash("sha256").update(`${tenantId}:${ipAddress||"unknown"}`).digest("hex"),key=`appointment:manage:${identity}`;return Number(await getRedis().eval(limiterScript,1,key,15*60*1000));
}
export async function consumePublicAppointmentLookup(ipAddress:string){
 const identity=createHash("sha256").update(ipAddress||"unknown").digest("hex"),key=`appointment:lookup:${identity}`;return Number(await getRedis().eval(limiterScript,1,key,15*60*1000));
}
export async function consumeCustomerPortalLookup(ipAddress:string){
 const identity=createHash("sha256").update(ipAddress||"unknown").digest("hex"),key=`customer:portal:${identity}`;return Number(await getRedis().eval(limiterScript,1,key,15*60*1000));
}
