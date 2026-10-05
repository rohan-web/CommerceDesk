import {NextResponse} from "next/server";
import {readSession} from "@/server/auth";
export async function GET(){
 try{const session=await readSession();if(!session)return NextResponse.json({authenticated:false},{status:401});return NextResponse.json({authenticated:true,user:{name:session.name,email:session.email}})}
 catch{return NextResponse.json({error:"Session service is temporarily unavailable."},{status:503})}
}
