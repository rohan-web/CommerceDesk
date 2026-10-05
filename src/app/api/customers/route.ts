import {randomBytes} from "node:crypto";
import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import {z} from "zod";
import {requireTenantAccess} from "@/server/tenant-scope";
import {Customer} from "@/server/models/Customer";
import {AuditEvent} from "@/server/models/AuditEvent";
const createSchema=z.object({name:z.string().trim().min(2).max(160),email:z.string().trim().email().max(254).nullable().optional(),phone:z.string().trim().max(40).nullable().optional(),company:z.string().trim().max(160).default(""),status:z.enum(["lead","customer","archived"]).default("lead"),tags:z.array(z.string().trim().min(1).max(32)).max(20).default([]),notes:z.string().trim().max(4000).default(""),emailMarketingOptIn:z.boolean().default(false),whatsappMarketingOptIn:z.boolean().default(false)}).strict();
function fail(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"You do not have permission to view these customer records."},{status:403});return NextResponse.json({error:"Customer service is temporarily unavailable."},{status:503})}
function escape(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
export const dynamic="force-dynamic";
export async function GET(request:Request){
 let access;try{access=await requireTenantAccess("customers:read")}catch(error){return fail(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 const url=new URL(request.url),q=(url.searchParams.get("q")||"").trim().slice(0,120),status=url.searchParams.get("status");const page=Math.max(1,Number.parseInt(url.searchParams.get("page")||"1",10)||1),limit=Math.max(1,Math.min(100,Number.parseInt(url.searchParams.get("limit")||"25",10)||25));
 const filter:Record<string,unknown>={tenantId:access.scope.tenantId};if(q){const rx={$regex:escape(q),$options:"i"};filter.$or=[{name:rx},{email:rx},{phone:rx},{company:rx}]}if(["lead","customer","archived"].includes(status||""))filter.status=status;
 try{const [customers,total]=await Promise.all([Customer.find(filter).sort({updatedAt:-1,_id:1}).skip((page-1)*limit).limit(limit).lean(),Customer.countDocuments(filter)]);return NextResponse.json({customers,page,limit,total,pageCount:Math.ceil(total/limit)},{headers:{"Cache-Control":"private, no-store"}})}catch(error){return fail(error)}
}
export async function POST(request:Request){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
 let access;try{access=await requireTenantAccess("customers:write")}catch(error){return fail(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 if(Number(request.headers.get("content-length")||0)>16000)return NextResponse.json({error:"Request is too large."},{status:413});const limitedJsonBody=await readJsonLimited(request,24000);if(limitedJsonBody.kind==="too-large")return NextResponse.json({error:"Request is too large."},{status:413});const parsed=createSchema.safeParse(limitedJsonBody.kind==="ok"?limitedJsonBody.value:null);if(!parsed.success)return NextResponse.json({error:"Review the customer details and try again.",issues:parsed.error.issues.map((issue)=>({field:issue.path.join("."),message:issue.message}))},{status:400});
 const data=parsed.data,session=await mongoose.startSession();let result:unknown;try{await session.withTransaction(async()=>{const now=new Date();const[customer]=await Customer.create([{tenantId:access.scope.tenantId,...data,email:data.email?.trim().toLowerCase()||null,phone:data.phone?.trim()||null,tags:[...new Set(data.tags.map((tag)=>tag.toLowerCase()))],emailConsentAt:data.emailMarketingOptIn?now:null,whatsappConsentAt:data.whatsappMarketingOptIn?now:null}],{session});await AuditEvent.create([{tenantId:access.scope.tenantId,actorId:access.scope.userId,action:"customer.created",entityType:"customer",entityId:String(customer._id),requestId:randomBytes(12).toString("hex"),metadata:{status:customer.status,consentEmail:customer.emailMarketingOptIn,consentWhatsapp:customer.whatsappMarketingOptIn}}],{session});result=customer.toObject()})}catch(error){if((error as {code?:number})?.code===11000)return NextResponse.json({error:"A customer with this email address already exists in this workspace."},{status:409});return fail(error)}finally{await session.endSession()}
 return NextResponse.json({customer:result},{status:201,headers:{"Cache-Control":"private, no-store"}})
}

