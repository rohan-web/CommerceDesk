import {z} from "zod";
import {NextResponse} from "next/server";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import {randomBytes} from "node:crypto";
import {connectDatabase} from "@/server/db";
import {requireTenantAccess} from "@/server/tenant-scope";
import {CatalogueItem} from "@/server/models/CatalogueItem";
import {AuditEvent} from "@/server/models/AuditEvent";
import mongoose from "mongoose";
const createSchema=z.object({
 name:z.string().trim().min(2).max(160),sku:z.string().trim().max(80).optional(),description:z.string().trim().max(5000).default(""),
 kind:z.enum(["physical","service"]),status:z.enum(["draft","active","archived"]).default("draft"),category:z.string().trim().max(80).default(""),storefrontPublished:z.boolean().default(false),
 unitPriceMinor:z.number().int().safe().min(0),taxRateBps:z.number().int().safe().min(0).max(100000).default(0),taxMode:z.enum(["inclusive","exclusive"]),
 trackInventory:z.boolean().optional(),serviceDurationMinutes:z.number().int().safe().min(5).max(1440).optional()
}).superRefine((v,ctx)=>{
 if(v.kind==="service"&&(!v.serviceDurationMinutes||v.trackInventory))ctx.addIssue({code:"custom",message:"Services need a duration and cannot track stock."});
 if(v.storefrontPublished&&(v.kind!=="physical"||v.status!=="active"))ctx.addIssue({code:"custom",path:["storefrontPublished"],message:"Only active physical products can be published to the store."});
 if(v.kind==="physical"&&v.serviceDurationMinutes)ctx.addIssue({code:"custom",message:"Physical products cannot set a service duration."});
});
function slugify(value:string){const slug=value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,160);return slug||`item-${randomBytes(5).toString("hex")}`}
function failure(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"You do not have permission to manage this catalogue."},{status:403});return NextResponse.json({error:"Catalogue service is temporarily unavailable."},{status:503})}
export async function GET(request:Request){
 let access;try{access=await requireTenantAccess("catalogue:read")}catch(e){return failure(e)}
 if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 const url=new URL(request.url),q=(url.searchParams.get("q")||"").trim().slice(0,120),status=url.searchParams.get("status"),kind=url.searchParams.get("kind");
 const page=Math.max(1,Math.min(10000,Number.parseInt(url.searchParams.get("page")||"1",10)||1));const limit=Math.max(1,Math.min(100,Number.parseInt(url.searchParams.get("limit")||"25",10)||25));
 const filter:Record<string,unknown>={tenantId:access.scope.tenantId};if(q)filter.$or=[{name:{$regex:q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),$options:"i"}},{sku:{$regex:q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),$options:"i"}}];
 if(["draft","active","archived"].includes(status||""))filter.status=status;if(["physical","service"].includes(kind||""))filter.kind=kind;
 try{await connectDatabase();const [items,total]=await Promise.all([CatalogueItem.find(filter).sort({updatedAt:-1,_id:1}).skip((page-1)*limit).limit(limit).lean(),CatalogueItem.countDocuments(filter)]);return NextResponse.json({items,currency:access.tenant.baseCurrency,page,limit,total,pageCount:Math.ceil(total/limit)},{headers:{"Cache-Control":"private, no-store"}})}catch(e){return failure(e)}
}
export async function POST(request:Request){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
 let access;try{access=await requireTenantAccess("catalogue:write")}catch(e){return failure(e)}
 if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 if(access.tenant.commerceMode!=="native")return NextResponse.json({error:"This store is WooCommerce-connected. Catalogue edits must be made in the connected store."},{status:409});
 if(Number(request.headers.get("content-length")||0)>16000)return NextResponse.json({error:"Request is too large."},{status:413});
 const limitedJsonBody=await readJsonLimited(request,24000);if(limitedJsonBody.kind==="too-large")return NextResponse.json({error:"Request is too large."},{status:413});const parsed=createSchema.safeParse(limitedJsonBody.kind==="ok"?limitedJsonBody.value:null);if(!parsed.success)return NextResponse.json({error:"Review the product fields and try again.",issues:parsed.error.issues.map(i=>({field:i.path.join("."),message:i.message}))},{status:400});
 const input=parsed.data,session=await mongoose.startSession();let result:unknown;
 try{await session.withTransaction(async()=>{
  const[created]=await CatalogueItem.create([{tenantId:access.scope.tenantId,name:input.name,slug:slugify(input.name),sku:input.sku?.trim()?input.sku.trim().toUpperCase():null,description:input.description,category:input.category.trim().toLowerCase(),storefrontPublished:input.storefrontPublished,kind:input.kind,status:input.status,unitPriceMinor:input.unitPriceMinor,taxRateBps:input.taxRateBps,taxMode:input.taxMode,trackInventory:input.kind==="physical"&&input.trackInventory!==false,stockOnHand:0,stockReserved:0,serviceDurationMinutes:input.kind==="service"?input.serviceDurationMinutes:null}],{session});
  await AuditEvent.create([{tenantId:access.scope.tenantId,actorId:access.scope.userId,action:"catalogue.item_created",entityType:"catalogue_item",entityId:String(created._id),requestId:randomBytes(12).toString("hex"),metadata:{kind:created.kind,status:created.status}}],{session});
  result=created.toObject();
 })}catch(e){if((e as {code?:number})?.code===11000)return NextResponse.json({error:"That SKU or product slug is already in use in this workspace."},{status:409});return failure(e)}finally{await session.endSession()}
 return NextResponse.json({item:result,currency:access.tenant.baseCurrency},{status:201,headers:{"Cache-Control":"private, no-store"}});
}



