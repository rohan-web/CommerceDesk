import {randomBytes} from "node:crypto";
import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {z} from "zod";
import {requireTenantAccess} from "@/server/tenant-scope";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import {Membership} from "@/server/models/Membership";
import {User} from "@/server/models/User";
import {Invitation} from "@/server/models/Invitation";
import {AuditEvent} from "@/server/models/AuditEvent";
import {hashSessionToken,newSessionToken} from "@/server/secrets";

export const dynamic="force-dynamic";
const inviteSchema=z.object({email:z.string().trim().email().max(254),role:z.enum(["owner","sales","operations","finance","support"])}).strict();
function denied(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"Only a workspace owner can manage team access."},{status:403});return NextResponse.json({error:"Team access is temporarily unavailable."},{status:503})}
export async function GET(){
 let access;try{access=await requireTenantAccess("members:manage")}catch(error){return denied(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 try{const[memberships,invitations]=await Promise.all([Membership.find({tenantId:access.scope.tenantId,revokedAt:null}).sort({createdAt:1}).lean(),Invitation.find({tenantId:access.scope.tenantId,status:"pending",expiresAt:{$gt:new Date()}}).select("email role expiresAt createdAt").sort({createdAt:-1}).lean()]);const users=await User.find({_id:{$in:memberships.map(member=>member.userId)}}).select("name email disabledAt").lean();const byId=new Map(users.map(user=>[String(user._id),user]));return NextResponse.json({members:memberships.map(member=>({id:String(member._id),userId:String(member.userId),name:byId.get(String(member.userId))?.name||"Disabled account",email:byId.get(String(member.userId))?.email||"",disabled:!!byId.get(String(member.userId))?.disabledAt,role:member.role,permissions:member.permissions,createdAt:member.createdAt})),invitations},{headers:{"Cache-Control":"private, no-store"}})}catch(error){return denied(error)}
}
export async function POST(request:Request){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});let access;try{access=await requireTenantAccess("members:manage")}catch(error){return denied(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 const body=await readJsonLimited(request,8000);if(body.kind==="too-large")return NextResponse.json({error:"Request is too large."},{status:413});const parsed=inviteSchema.safeParse(body.kind==="ok"?body.value:null);if(!parsed.success)return NextResponse.json({error:"Enter a valid team email and role."},{status:400});
 const base=process.env.APP_URL;if(!base)return NextResponse.json({error:"Set APP_URL before creating invitation links."},{status:503});let invitationOrigin:string;try{invitationOrigin=new URL(base).origin}catch{return NextResponse.json({error:"APP_URL must be a valid absolute URL."},{status:503})}const email=parsed.data.email.toLowerCase(),token=newSessionToken(),expiresAt=new Date(Date.now()+48*60*60*1000),tenantId=access.scope.tenantId,session=await mongoose.startSession();let invitationId="";
 try{await session.withTransaction(async()=>{const tenantLock=await import("@/server/models/Tenant");await tenantLock.Tenant.updateOne({_id:tenantId},{$inc:{version:1}},{session});const user=await User.findOne({email}).select("_id").session(session).lean();if(user&&await Membership.exists({tenantId,userId:user._id,revokedAt:null}).session(session))throw new Error("ALREADY_MEMBER");await Invitation.updateMany({tenantId,email,status:"pending"},{$set:{status:"revoked",revokedAt:new Date()}},{session});const[invitation]=await Invitation.create([{tenantId,email,role:parsed.data.role,tokenHash:hashSessionToken(token),status:"pending",expiresAt,createdBy:access!.scope.userId}],{session});await AuditEvent.create([{tenantId,actorId:access!.scope.userId,action:"member.invitation_created",entityType:"invitation",entityId:String(invitation._id),requestId:randomBytes(12).toString("hex"),metadata:{email,role:invitation.role,expiresAt:expiresAt.toISOString()}}],{session});invitationId=String(invitation._id)})}catch(error){if(error instanceof Error&&error.message==="ALREADY_MEMBER")return NextResponse.json({error:"This person is already a member of the workspace."},{status:409});if((error as {code?:number})?.code===11000)return NextResponse.json({error:"An invitation for this person was just created. Refresh the team list."},{status:409});return denied(error)}finally{await session.endSession()}
 return NextResponse.json({invitation:{id:invitationId,email,role:parsed.data.role,expiresAt,acceptUrl:`${invitationOrigin}/invite/${token}`},delivery:"manual"},{status:201,headers:{"Cache-Control":"no-store"}})
}
