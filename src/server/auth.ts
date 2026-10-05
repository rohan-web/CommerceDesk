import {cookies} from "next/headers";
import type {NextResponse} from "next/server";
import {connectDatabase} from "./db";
import {Session} from "./models/Session";
import {User} from "./models/User";
import {Membership} from "./models/Membership";
import {Tenant} from "./models/Tenant";
import {hashSessionToken,newSessionToken} from "./secrets";
const COOKIE="cd_session";
const TTL_SECONDS=60*60*24*14;
export async function createSession(userId:string,tenantId:string){
 await connectDatabase();const token=newSessionToken();const expiresAt=new Date(Date.now()+TTL_SECONDS*1000);
 await Session.create({userId,tenantId,tokenHash:hashSessionToken(token),expiresAt});return {token,expiresAt};
}
export function setSessionCookie(response:NextResponse,token:string){response.cookies.set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:TTL_SECONDS});return response}
export function clearSessionCookie(response:NextResponse){response.cookies.set(COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:0});return response}
export async function readSession(){
 const token=(await cookies()).get(COOKIE)?.value;
 if(!token||!/^[A-Za-z0-9_-]{40,50}$/.test(token))return null;
 await connectDatabase();
 const session=await Session.findOne({tokenHash:hashSessionToken(token),revokedAt:null,expiresAt:{$gt:new Date()}}).select("userId tenantId").lean();
 if(!session?.tenantId)return null;
 const [user,membership]=await Promise.all([
  User.findOne({_id:session.userId,disabledAt:null}).select("name email").lean(),
  Membership.findOne({tenantId:session.tenantId,userId:session.userId,revokedAt:null}).select("role").lean(),
 ]);
 if(!user||!membership)return null;
 const tenant=await Tenant.findById(session.tenantId).select("name").lean();if(!tenant)return null;
 return {userId:String(user._id),name:user.name,email:user.email,sessionId:String(session._id),tenantId:String(tenant._id),tenantName:tenant.name,role:membership.role};
}
export async function revokeCurrentSession(){
 const token=(await cookies()).get(COOKIE)?.value;if(!token)return;
 await connectDatabase();await Session.updateOne({tokenHash:hashSessionToken(token),revokedAt:null},{$set:{revokedAt:new Date()}});
}
