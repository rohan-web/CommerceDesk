import {createHash,randomBytes} from "node:crypto";
import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {requireTenantAccess} from "@/server/tenant-scope";
import {isSameOrigin} from "@/server/request-security";
import {Quote} from "@/server/models/Quote";
import {QuoteRevision} from "@/server/models/QuoteRevision";
import {Customer} from "@/server/models/Customer";
import {CatalogueItem} from "@/server/models/CatalogueItem";
import {AuditEvent} from "@/server/models/AuditEvent";
import {calculateLineAmount} from "@/server/domain/money";
type Context={params:Promise<{id:string}>};
function fail(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"You do not have permission to issue quotes."},{status:403});return NextResponse.json({error:"Quote service is temporarily unavailable."},{status:503})}
function sum(values:number[]){const value=values.reduce((total,amount)=>total+BigInt(amount),0n),number=Number(value);if(!Number.isSafeInteger(number))throw new RangeError("Quote total exceeds the safe integer range.");return number}
export async function POST(request:Request,context:Context){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});let access;try{access=await requireTenantAccess("quotes:write")}catch(error){return fail(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});if(access.tenant.commerceMode!=="native")return NextResponse.json({error:"Quotes for this connected store must be managed in WooCommerce."},{status:409});const{id}=await context.params;if(!mongoose.isValidObjectId(id))return NextResponse.json({error:"Quote not found."},{status:404});const session=await mongoose.startSession();let result:unknown,sharePath="",mode:"issued"|"shared"="issued";
 try{await session.withTransaction(async()=>{
  const quote=await Quote.findOne({_id:id,tenantId:access.scope.tenantId}).session(session);if(!quote)throw new Error("QUOTE_NOT_FOUND");
  if(quote.status==="issued"&&quote.expiresAt<=new Date())throw new Error("QUOTE_EXPIRED");if(quote.status==="issued"){const token=randomBytes(32).toString("hex");quote.acceptTokenHash=createHash("sha256").update(token).digest("hex");await quote.save({session});sharePath=`/quote/${token}`;mode="shared";const safeQuote=quote.toObject();delete (safeQuote as {acceptTokenHash?:string}).acceptTokenHash;result=safeQuote;return}
  if(quote.status!=="draft")throw new Error("QUOTE_NOT_DRAFT");if(quote.expiresAt<=new Date())throw new Error("QUOTE_EXPIRED");
  const customer=await Customer.findOne({_id:quote.customerId,tenantId:access.scope.tenantId,status:{$ne:"archived"}}).session(session).lean();if(!customer)throw new Error("CUSTOMER_NOT_FOUND");
  const items=await CatalogueItem.find({_id:{$in:quote.draftLines.map((line)=>line.itemId)},tenantId:access.scope.tenantId,status:"active"}).session(session).lean();if(items.length!==quote.draftLines.length)throw new Error("ITEM_UNAVAILABLE");const map=new Map(items.map((item)=>[String(item._id),item]));const revision=quote.currentRevision+1,lines=[] as Record<string,unknown>[];
  for(const draft of quote.draftLines){const item=map.get(String(draft.itemId));if(!item)throw new Error("ITEM_UNAVAILABLE");const amount=calculateLineAmount({unitPriceMinor:item.unitPriceMinor,quantity:draft.quantity,taxRateBps:item.taxRateBps,taxMode:item.taxMode as "inclusive"|"exclusive"},access.tenant.baseCurrency);lines.push({itemId:item._id,kind:item.kind,name:item.name,sku:item.sku,quantity:draft.quantity,unitPriceMinor:item.unitPriceMinor,taxRateBps:item.taxRateBps,taxMode:item.taxMode,netMinor:amount.netMinor,taxMinor:amount.taxMinor,grossMinor:amount.grossMinor,tracksStock:item.kind==="physical"&&item.trackInventory})}
  const subtotalMinor=sum(lines.map((line)=>line.netMinor as number)),taxMinor=sum(lines.map((line)=>line.taxMinor as number)),totalMinor=sum(lines.map((line)=>line.grossMinor as number));
  await QuoteRevision.create([{tenantId:access.scope.tenantId,quoteId:quote._id,revision,customerSnapshot:{name:customer.name,email:customer.email,phone:customer.phone},lines,currency:access.tenant.baseCurrency,subtotalMinor,taxMinor,totalMinor,terms:quote.terms,expiresAt:quote.expiresAt,createdBy:access.scope.userId}],{session});
  const token=randomBytes(32).toString("hex");quote.status="issued";quote.currentRevision=revision;quote.customerSnapshot={name:customer.name,email:customer.email,phone:customer.phone};quote.acceptTokenHash=createHash("sha256").update(token).digest("hex");await quote.save({session});await AuditEvent.create([{tenantId:access.scope.tenantId,actorId:access.scope.userId,action:"quote.issued",entityType:"quote",entityId:String(quote._id),requestId:randomBytes(12).toString("hex"),metadata:{quoteNumber:quote.quoteNumber,revision,totalMinor,currency:access.tenant.baseCurrency}}],{session});sharePath=`/quote/${token}`;const safeQuote=quote.toObject();delete (safeQuote as {acceptTokenHash?:string}).acceptTokenHash;result=safeQuote;
 })}catch(error){if(error instanceof Error&&error.message==="QUOTE_NOT_FOUND")return NextResponse.json({error:"Quote not found."},{status:404});if(error instanceof Error&&error.message==="QUOTE_EXPIRED")return NextResponse.json({error:"This quote has expired. Create a new draft to offer updated terms."},{status:409});if(error instanceof Error&&error.message==="QUOTE_EXPIRED")return NextResponse.json({error:"This draft has expired. Revise it and set a new validity period before issuing."},{status:409});if(error instanceof Error&&error.message==="QUOTE_NOT_DRAFT")return NextResponse.json({error:"Only a draft can be issued or an issued quote can have its share link renewed."},{status:409});if(error instanceof Error&&error.message==="CUSTOMER_NOT_FOUND")return NextResponse.json({error:"The customer is no longer active in this workspace."},{status:409});if(error instanceof Error&&error.message==="ITEM_UNAVAILABLE")return NextResponse.json({error:"An item is no longer active in this workspace."},{status:409});return fail(error)}finally{await session.endSession()}
 return NextResponse.json({quote:result,sharePath,mode},{headers:{"Cache-Control":"private, no-store"}})
}





