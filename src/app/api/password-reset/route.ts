import {createHash} from "node:crypto";
import {NextResponse} from "next/server";
import {z} from "zod";
import {connectDatabase} from "@/server/db";
import {User} from "@/server/models/User";
import {Membership} from "@/server/models/Membership";
import {SmtpConnection} from "@/server/models/SmtpConnection";
import {queuePasswordResetEmail} from "@/server/email-delivery";
import {consumePasswordResetEmail,consumePasswordResetIp} from "@/server/rate-limit";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import {portalIp} from "@/server/customer-portal";
const schema=z.object({email:z.string().trim().email().max(254)}).strict();
const response=()=>NextResponse.json({ok:true,message:"If an account matches that email and password recovery is available, reset instructions will be sent."},{status:202,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
export async function POST(request:Request){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
 const body=await readJsonLimited(request,4000);if(body.kind!=="ok")return NextResponse.json({error:"Enter a valid email address."},{status:400});const parsed=schema.safeParse(body.value);if(!parsed.success)return NextResponse.json({error:"Enter a valid email address."},{status:400});
 const email=parsed.data.email.toLowerCase(),emailHash=createHash("sha256").update(email).digest("hex");
 try{const [ipCount,emailCount]=await Promise.all([consumePasswordResetIp(portalIp(request)),consumePasswordResetEmail(emailHash)]);if(ipCount>20||emailCount>5)return NextResponse.json({error:"Too many reset requests. Try again in 15 minutes."},{status:429,headers:{"Retry-After":"900","Cache-Control":"no-store"}})}catch{return NextResponse.json({error:"Password recovery is temporarily unavailable."},{status:503,headers:{"Cache-Control":"no-store"}})}
 try{await connectDatabase();const user=await User.findOne({email,disabledAt:null}).select("_id").lean();if(!user)return response();const memberships=await Membership.find({userId:user._id,revokedAt:null}).select("tenantId").sort({createdAt:1}).lean();if(!memberships.length)return response();const connection=await SmtpConnection.findOne({tenantId:{$in:memberships.map(item=>item.tenantId)},status:"verified"}).select("tenantId").sort({createdAt:1}).lean();if(!connection)return response();await queuePasswordResetEmail({userId:String(user._id),tenantId:String(connection.tenantId),recipient:email});return response()}catch{return NextResponse.json({error:"Password recovery is temporarily unavailable."},{status:503,headers:{"Cache-Control":"no-store"}})}
}
