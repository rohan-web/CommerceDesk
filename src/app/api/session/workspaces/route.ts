import {NextResponse} from "next/server";
import {readSession} from "@/server/auth";
import {connectDatabase} from "@/server/db";
import {Membership} from "@/server/models/Membership";
import {Tenant} from "@/server/models/Tenant";
export const dynamic="force-dynamic";
export async function GET(){
 try{
  const session=await readSession();if(!session)return NextResponse.json({error:"Sign in is required."},{status:401});
  await connectDatabase();const memberships=await Membership.find({userId:session.userId,revokedAt:null}).select("tenantId").lean();
  const tenants=await Tenant.find({_id:{$in:memberships.map((membership)=>membership.tenantId)}}).select("name").sort({name:1}).lean();
  return NextResponse.json({workspaces:tenants.map((tenant)=>({id:String(tenant._id),name:tenant.name,current:String(tenant._id)===session.tenantId}))},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Workspace list is temporarily unavailable."},{status:503})}
}
