import {z} from "zod";
import {NextResponse} from "next/server";
import {createHash,timingSafeEqual} from "node:crypto";
import mongoose from "mongoose";
import {connectDatabase} from "@/server/db";
import {Tenant} from "@/server/models/Tenant";
import {User} from "@/server/models/User";
import {Membership} from "@/server/models/Membership";
import {SetupState} from "@/server/models/SetupState";
import {Session} from "@/server/models/Session";
import {hashPassword,hashSessionToken,newSessionToken} from "@/server/secrets";
import {setSessionCookie} from "@/server/auth";
import {readJsonLimited} from "@/server/request-security";
const schema=z.object({
 setupToken:z.string().min(32).max(512),businessName:z.string().trim().min(2).max(120),ownerName:z.string().trim().min(2).max(120),
 email:z.string().trim().email().max(254),password:z.string().min(12).max(128),
 deploymentMode:z.enum(["standalone","platform"]),commerceMode:z.enum(["native","woocommerce"]),
 baseCurrency:z.string().regex(/^[A-Z]{3}$/),timezone:z.string().min(2).max(100)
});
const tenantSlug=(value:string)=>value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80);
function sameOrigin(request:Request){const base=process.env.APP_URL;if(!base)return false;try{return request.headers.get("origin")===new URL(base).origin}catch{return false}}
function safeTokenEqual(provided:string,expected:string){const a=Buffer.from(provided),b=Buffer.from(expected);return a.length===b.length&&a.length>=32&&timingSafeEqual(a,b)}
export async function POST(request:Request){
 if(!sameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});

 const expected=process.env.SETUP_TOKEN;
 if(!expected||expected.length<32)return NextResponse.json({error:"Setup is not configured. Set a one-time SETUP_TOKEN first."},{status:503});
 const body=await readJsonLimited(request,20000);if(body.kind==="too-large")return NextResponse.json({error:"Request is too large."},{status:413});const parsed=schema.safeParse(body.kind==="ok"?body.value:null);
 if(!parsed.success)return NextResponse.json({error:"Review the required fields and try again."},{status:400});
 const input=parsed.data;if(!safeTokenEqual(input.setupToken,expected))return NextResponse.json({error:"Setup could not be authorized."},{status:403});
 try{if(!Intl.supportedValuesOf("currency").includes(input.baseCurrency))throw new Error("Unsupported currency");new Intl.DateTimeFormat("en",{timeZone:input.timezone})}catch{return NextResponse.json({error:"Enter a supported currency and business time zone."},{status:400})}
 const passwordHash=await hashPassword(input.password);const sessionToken=newSessionToken();const expiresAt=new Date(Date.now()+14*24*60*60*1000);await connectDatabase();const dbSession=await mongoose.startSession();
 try{
  await dbSession.withTransaction(async()=>{
   if(await SetupState.exists({_id:"installation"}).session(dbSession))throw new Error("SETUP_COMPLETE");
   if(await Tenant.exists({}).session(dbSession))throw new Error("SETUP_LOCKED");
   const [user]=await User.create([{name:input.ownerName,email:input.email.toLowerCase(),passwordHash}],{session:dbSession});
   const [tenant]=await Tenant.create([{name:input.businessName,slug:tenantSlug(input.businessName),deploymentMode:input.deploymentMode,commerceMode:input.commerceMode,baseCurrency:input.baseCurrency,timezone:input.timezone,setupCompletedAt:new Date()}],{session:dbSession});
   await Membership.create([{tenantId:tenant._id,userId:user._id,role:"owner"}],{session:dbSession});
   await Session.create([{userId:user._id,tenantId:tenant._id,tokenHash:hashSessionToken(sessionToken),expiresAt}],{session:dbSession});
   await SetupState.create([{_id:"installation",setupCompletedAt:new Date(),tenantId:tenant._id,ownerUserId:user._id}],{session:dbSession});
   await import("@/server/models/AuditEvent").then(({AuditEvent})=>AuditEvent.create([{tenantId:tenant._id,actorId:user._id,action:"installation.owner_created",entityType:"tenant",entityId:String(tenant._id),requestId:createHash("sha256").update(sessionToken).digest("hex").slice(0,24),metadata:{deploymentMode:input.deploymentMode,commerceMode:input.commerceMode}}],{session:dbSession}));
  });
 }catch(error){
  const message=error instanceof Error?error.message:"";
  if(message==="SETUP_COMPLETE"||message==="SETUP_LOCKED")return NextResponse.json({error:"First-run setup is already closed."},{status:409});
  if((error as {code?:number})?.code===11000)return NextResponse.json({error:"The workspace name or email is already in use."},{status:409});
  console.error(JSON.stringify({level:"error",event:"setup_failed",code:(error as {code?:number})?.code??"TRANSACTION_FAILED"}));return NextResponse.json({error:"Setup did not complete. Correct the issue and retry."},{status:500});
 }finally{await dbSession.endSession()}
 const response=NextResponse.json({ok:true,workspaceCreated:true});setSessionCookie(response,sessionToken);return response;
}

