import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {requireTenantAccess} from "@/server/tenant-scope";
import {Order} from "@/server/models/Order";

type Context={params:Promise<{id:string}>};
function fail(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"Only operations staff and owners can view packing slips."},{status:403});return NextResponse.json({error:"Packing slip service is temporarily unavailable."},{status:503})}
export const dynamic="force-dynamic";

export async function GET(_request:Request,context:Context){
 let access;try{access=await requireTenantAccess("orders:fulfil")}catch(error){return fail(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 if(access.tenant.commerceMode!=="native")return NextResponse.json({error:"Packing slips are managed by the connected commerce platform."},{status:409});
 const {id}=await context.params;if(!mongoose.isValidObjectId(id))return NextResponse.json({error:"Order not found."},{status:404});
 try{
  const order=await Order.findOne({_id:id,tenantId:access.scope.tenantId}).lean();if(!order)return NextResponse.json({error:"Order not found."},{status:404});
  const dispatch=[...(order.fulfilments||[])].reverse().find(event=>event.eventType==="dispatch");if(!dispatch)return NextResponse.json({error:"This order has no physical dispatch to pack."},{status:409});
  const items=dispatch.lines.flatMap(part=>{const line=order.lines[part.lineIndex];if(!line||line.kind!=="physical")return [];return [{name:line.name,sku:line.sku,variantName:line.variantName,variantOptions:line.variantOptions,quantity:part.quantity,orderedQuantity:line.quantity}]});
  if(!items.length)return NextResponse.json({error:"This dispatch has no physical items."},{status:409});
  const shipping=order.shippingAddress;
  return NextResponse.json({packingSlip:{orderNumber:order.orderNumber,dispatchId:String(dispatch._id),packedAt:dispatch.occurredAt,customerName:order.customerSnapshot?.name||"Customer",fulfilmentMethod:order.fulfilmentMethod,shippingAddress:shipping?{recipient:shipping.recipient,line1:shipping.line1,line2:shipping.line2,city:shipping.city,region:shipping.region,postalCode:shipping.postalCode,countryCode:shipping.countryCode}:null,items}},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return fail(error)}
}
