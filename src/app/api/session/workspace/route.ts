import {z} from "zod";
import {NextResponse} from "next/server";
import {readSession} from "@/server/auth";
import {connectDatabase} from "@/server/db";
import {Membership} from "@/server/models/Membership";
import {Session} from "@/server/models/Session";
import {readJsonLimited} from "@/server/request-security";
const schema=z.object({tenantId:z.string().regex(/^[a-f\d]{24}$/i)});
function sameOrigin(request:Request){const base=process.env.APP_URL;if(!base)return false;try{return request.headers.get("origin")===new URL(base).origin}catch{return false}}
export async function POST(request:Request){
 if(!sameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
 const current=await readSession();if(!current)return NextResponse.json({error:"Sign in is required."},{status:401});
 const body=await readJsonLimited(request,4000);if(body.kind==="too-large")return NextResponse.json({error:"Request is too large."},{status:413});const parsed=schema.safeParse(body.kind==="ok"?body.value:null);if(!parsed.success)return NextResponse.json({error:"Choose a valid workspace."},{status:400});
 try{
  await connectDatabase();const membership=await Membership.findOne({tenantId:parsed.data.tenantId,userId:current.userId,revokedAt:null}).select("_id").lean();
  if(!membership)return NextResponse.json({error:"This account cannot access that workspace."},{status:403});
  const updated=await Session.updateOne({_id:current.sessionId,userId:current.userId,tenantId:current.tenantId,revokedAt:null,expiresAt:{$gt:new Date()}},{$set:{tenantId:parsed.data.tenantId}});
  if(!updated.matchedCount)return NextResponse.json({error:"Your session changed. Sign in again."},{status:401});
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Workspace switch is temporarily unavailable."},{status:503})}
}
