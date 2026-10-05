import {randomBytes} from "node:crypto";
import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {isSameOrigin} from "@/server/request-security";
import {requireTenantAccess} from "@/server/tenant-scope";
import {Appointment} from "@/server/models/Appointment";
import {AuditEvent} from "@/server/models/AuditEvent";
import {hashSessionToken} from "@/server/secrets";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function POST(request:Request,context:Context){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
 let access;try{access=await requireTenantAccess("appointments:write")}catch(error){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"You do not have permission to issue customer appointment links."},{status:403});return NextResponse.json({error:"Appointments are temporarily unavailable."},{status:503})}
 if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 const{id}=await context.params;if(!mongoose.isValidObjectId(id))return NextResponse.json({error:"Appointment not found."},{status:404});
 const token=randomBytes(32).toString("base64url"),tokenHash=hashSessionToken(token),session=await mongoose.startSession();let expiresAt:Date|undefined,notIssuable=false;
 try{await session.withTransaction(async()=>{
  const appointment=await Appointment.findOne({_id:id,tenantId:access!.scope.tenantId,status:"confirmed",startsAt:{$gt:new Date()}}).select("_id startsAt").session(session);
  if(!appointment){notIssuable=true;return}
  expiresAt=new Date(Math.max(Date.now()+90*86400000,appointment.startsAt.getTime()+14*86400000));
  const updated=await Appointment.findOneAndUpdate({_id:id,tenantId:access!.scope.tenantId,status:"confirmed",startsAt:{$gt:new Date()}},{manageTokenHash:tokenHash,manageTokenExpiresAt:expiresAt},{new:true,session}).select("_id").lean();
  if(!updated){notIssuable=true;return}
  await AuditEvent.create([{tenantId:access!.scope.tenantId,actorId:access!.scope.userId,action:"appointment.manage_link_issued",entityType:"appointment",entityId:String(updated._id),requestId:randomBytes(12).toString("hex"),metadata:{expiresAt}}],{session});
 })}catch{return NextResponse.json({error:"A customer appointment link could not be issued."},{status:503})}finally{await session.endSession()}
 if(notIssuable||!expiresAt)return NextResponse.json({error:"A customer link is available only for an upcoming confirmed appointment."},{status:409});
 return NextResponse.json({url:new URL(`/appointment/${token}`,request.url).toString(),expiresAt},{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
}
