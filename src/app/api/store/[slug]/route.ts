import {NextResponse} from "next/server";
import {loadPublicStore} from "@/server/public-store";
export const dynamic="force-dynamic";
type Context={params:Promise<{slug:string}>};
export async function GET(_request:Request,context:Context){try{const{slug}=await context.params,store=await loadPublicStore(slug);if(!store)return NextResponse.json({error:"This storefront is unavailable."},{status:404,headers:{"Cache-Control":"no-store"}});return NextResponse.json({store},{headers:{"Cache-Control":"public, max-age=30, stale-while-revalidate=60","Referrer-Policy":"no-referrer"}})}catch{return NextResponse.json({error:"Storefront is temporarily unavailable."},{status:503,headers:{"Cache-Control":"no-store"}})}}
