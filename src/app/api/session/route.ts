import {z} from "zod";
import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {connectDatabase} from "@/server/db";
import {User} from "@/server/models/User";
import {Session} from "@/server/models/Session";
import {Membership} from "@/server/models/Membership";
import {Tenant} from "@/server/models/Tenant";
import {hashSessionToken,newSessionToken,verifyPassword} from "@/server/secrets";
import {consumeLoginAttempt} from "@/server/rate-limit";
import {readJsonLimited} from "@/server/request-security";
import {setSessionCookie} from "@/server/auth";
import {consumeMfaFactor} from "@/server/mfa";
const schema=z.object({email:z.string().trim().email().max(254),password:z.string().min(1).max(128),tenantId:z.string().regex(/^[a-f\d]{24}$/i).optional(),mfaCode:z.string().trim().max(64).optional()});
const dummy="scrypt$MDEyMzQ1Njc4OWFiY2RlZg$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
function sameOrigin(request:Request){const base=process.env.APP_URL;if(!base)return false;try{return request.headers.get("origin")===new URL(base).origin}catch{return false}}
export async function POST(request:Request){
 if(!sameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});

 const body=await readJsonLimited(request,16000);if(body.kind==="too-large")return NextResponse.json({error:"Request is too large."},{status:413});const parsed=schema.safeParse(body.kind==="ok"?body.value:null);if(!parsed.success)return NextResponse.json({error:"Email or password is incorrect."},{status:401});
 const email=parsed.data.email.toLowerCase();
 try{if(await consumeLoginAttempt(createHash("sha256").update(email).digest("hex"))>8)return NextResponse.json({error:"Too many sign-in attempts. Try again in 15 minutes."},{status:429})}
 catch{return NextResponse.json({error:"Sign-in is temporarily unavailable."},{status:503})}
 try{
  await connectDatabase();const user=await User.findOne({email}).select("+passwordHash +mfaSecretEncrypted +mfaRecoveryHashes name email disabledAt mfaEnabledAt mfaLastCounter").lean();
  const valid=await verifyPassword(parsed.data.password,user?.passwordHash??dummy);
  if(!valid||!user||user.disabledAt)return NextResponse.json({error:"Email or password is incorrect."},{status:401});
  const memberships=await Membership.find({userId:user._id,revokedAt:null}).select("tenantId role").lean();
  if(!memberships.length)return NextResponse.json({error:"Email or password is incorrect."},{status:401});
  let membership=parsed.data.tenantId?memberships.find((entry)=>String(entry.tenantId)===parsed.data.tenantId):memberships.length===1?memberships[0]:undefined;
  if(parsed.data.tenantId&&!membership)return NextResponse.json({error:"This account cannot access that workspace."},{status:403});
  if(!membership){
   const tenants=await Tenant.find({_id:{$in:memberships.map((entry)=>entry.tenantId)}}).select("name").sort({name:1}).lean();
   return NextResponse.json({chooseWorkspace:tenants.map((tenant)=>({id:String(tenant._id),name:tenant.name})),mfaRequired:Boolean(user.mfaEnabledAt)},{headers:{"Cache-Control":"no-store"}});
  }
  if(user.mfaEnabledAt&&!parsed.data.mfaCode)return NextResponse.json({mfaRequired:true},{headers:{"Cache-Control":"no-store"}});
  if(user.mfaEnabledAt&&!(await consumeMfaFactor(user,parsed.data.mfaCode!)))return NextResponse.json({error:"Authenticator or recovery code is incorrect or already used."},{status:401});
  const token=newSessionToken(),expiresAt=new Date(Date.now()+14*24*60*60*1000);
  await Session.create({userId:user._id,tenantId:membership.tenantId,tokenHash:hashSessionToken(token),expiresAt});
  const response=NextResponse.json({ok:true,user:{name:user.name,email:user.email}});setSessionCookie(response,token);return response;
 }catch{return NextResponse.json({error:"Sign-in is temporarily unavailable."},{status:503})}
}
export async function DELETE(request:Request){
 if(!sameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
 const {revokeCurrentSession,clearSessionCookie}=await import("@/server/auth");await revokeCurrentSession();const response=NextResponse.json({ok:true});clearSessionCookie(response);return response;
}
