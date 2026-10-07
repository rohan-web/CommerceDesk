import {NextResponse} from "next/server";
import {z} from "zod";
import {completePasswordReset} from "@/server/password-reset";
import {consumePasswordResetIp} from "@/server/rate-limit";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import {portalIp} from "@/server/customer-portal";
const schema=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),password:z.string().min(12).max(128)}).strict();
const noStore={"Cache-Control":"no-store","Referrer-Policy":"no-referrer"};
export async function POST(request:Request){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});const body=await readJsonLimited(request,8000);if(body.kind!=="ok")return NextResponse.json({error:"The reset link is invalid or expired."},{status:400,headers:noStore});const parsed=schema.safeParse(body.value);if(!parsed.success)return NextResponse.json({error:"Enter a password with at least 12 characters and use a valid reset link."},{status:400,headers:noStore});
 try{if(await consumePasswordResetIp(portalIp(request))>30)return NextResponse.json({error:"Too many attempts. Try again later."},{status:429,headers:{...noStore,"Retry-After":"900"}})}catch{return NextResponse.json({error:"Password recovery is temporarily unavailable."},{status:503,headers:noStore})}
 try{const completed=await completePasswordReset(parsed.data.token,parsed.data.password);if(!completed)return NextResponse.json({error:"The reset link is invalid, expired, or already used."},{status:400,headers:noStore});return NextResponse.json({ok:true},{headers:noStore})}catch(error){if(error instanceof Error&&(error.message==="RESET_TOKEN_INVALID"||error.message==="RESET_ACCOUNT_UNAVAILABLE"))return NextResponse.json({error:"The reset link is invalid, expired, or already used."},{status:400,headers:noStore});return NextResponse.json({error:"Password recovery is temporarily unavailable."},{status:503,headers:noStore})}
}
