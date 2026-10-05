import {randomBytes} from "node:crypto";
import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {isSameOrigin} from "@/server/request-security";
import {requireTenantAccess} from "@/server/tenant-scope";
import {Customer} from "@/server/models/Customer";
import {CustomerPortalAccess} from "@/server/models/CustomerPortalAccess";
import {AuditEvent} from "@/server/models/AuditEvent";
import {hashSessionToken} from "@/server/secrets";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
function failure(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"You do not have permission to manage customer portal access."},{status:403});return NextResponse.json({error:"Customer portal access is temporarily unavailable."},{status:503})}
export async function POST(request:Request,context:Context){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});let access;try{access=await requireTenantAccess("customers:write")}catch(error){return failure(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 const{id}=await context.params;if(!mongoose.isValidObjectId(id))return NextResponse.json({error:"Customer not found."},{status:404});const token=randomBytes(32).toString("base64url"),tokenHash=hashSessionToken(token),expiresAt=new Date(Date.now()+180*86400000),session=await mongoose.startSession();let foundCustomer=false;
 try{await session.withTransaction(async()=>{const customer=await Customer.findOne({_id:id,tenantId:access!.scope.tenantId,status:"customer"}).select("_id").session(session).lean();if(!customer){foundCustomer=false;return}foundCustomer=true;await CustomerPortalAccess.findOneAndUpdate({tenantId:access!.scope.tenantId,customerId:customer._id},{$set:{tokenHash,expiresAt,issuedBy:new mongoose.Types.ObjectId(access!.scope.userId),lastAccessAt:null}},{upsert:true,new:true,session,setDefaultsOnInsert:true});await AuditEvent.create([{tenantId:access!.scope.tenantId,actorId:access!.scope.userId,action:"customer.portal_link_issued",entityType:"customer",entityId:String(customer._id),requestId:randomBytes(12).toString("hex"),metadata:{expiresAt,tokenRotated:true}}],{session})})}catch(error){if((error as {code?:number})?.code===11000)return NextResponse.json({error:"Customer portal access changed concurrently. Try again."},{status:409});return failure(error)}finally{await session.endSession()}
 if(!foundCustomer)return NextResponse.json({error:"Portal links are available only for active customer records."},{status:404});return NextResponse.json({url:new URL(`/portal/${token}`,request.url).toString(),expiresAt},{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}})
}
export async function DELETE(request:Request,context:Context){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});let access;try{access=await requireTenantAccess("customers:write")}catch(error){return failure(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});const{id}=await context.params;if(!mongoose.isValidObjectId(id))return NextResponse.json({error:"Customer not found."},{status:404});const session=await mongoose.startSession();let exists=false;
 try{await session.withTransaction(async()=>{const customer=await Customer.findOne({_id:id,tenantId:access!.scope.tenantId}).select("_id").session(session).lean();if(!customer)return;exists=true;const revoked=await CustomerPortalAccess.findOneAndUpdate({tenantId:access!.scope.tenantId,customerId:customer._id,tokenHash:{$type:"string"}},{$set:{tokenHash:null,expiresAt:null}},{new:true,session}).select("_id").lean();if(revoked)await AuditEvent.create([{tenantId:access!.scope.tenantId,actorId:access!.scope.userId,action:"customer.portal_link_revoked",entityType:"customer",entityId:String(customer._id),requestId:randomBytes(12).toString("hex"),metadata:{}}],{session})})}catch(error){return failure(error)}finally{await session.endSession()}
 if(!exists)return NextResponse.json({error:"Customer not found."},{status:404});return NextResponse.json({revoked:true},{headers:{"Cache-Control":"private, no-store"}})
}
