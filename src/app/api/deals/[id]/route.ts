import {randomBytes} from "node:crypto";
import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {z} from "zod";
import {requireTenantAccess} from "@/server/tenant-scope";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import {Deal} from "@/server/models/Deal";
import {DealEvent} from "@/server/models/DealEvent";
import {Customer} from "@/server/models/Customer";
import {Membership} from "@/server/models/Membership";
import {User} from "@/server/models/User";
import {AuditEvent} from "@/server/models/AuditEvent";
import {Tenant} from "@/server/models/Tenant";
import {canMoveDeal,salesStagesFor} from "@/server/domain/deals";

const stageSchema=z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_-]{1,39}$/);
const patchSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("move"),stage:stageSchema,lostReason:z.string().trim().max(500).default("")}).strict(),
 z.object({action:z.literal("edit"),title:z.string().trim().min(2).max(180).optional(),valueMinor:z.number().int().safe().min(0).max(Number.MAX_SAFE_INTEGER).optional(),dueAt:z.string().datetime({offset:true}).nullable().optional(),ownerId:z.string().regex(/^[a-f\d]{24}$/i).optional()}).strict()
]);
function failure(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"You do not have permission to access this deal."},{status:403});return NextResponse.json({error:"This deal is temporarily unavailable."},{status:503})}
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 let access;try{access=await requireTenantAccess("deals:write")}catch(error){return failure(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});const{id}=await params;if(!/^[a-f\d]{24}$/i.test(id))return NextResponse.json({error:"Deal not found."},{status:404});
 try{const filter:Record<string,unknown>={_id:id,tenantId:access.scope.tenantId};if(access.scope.role==="sales")filter.ownerId=access.scope.userId;const deal=await Deal.findOne(filter).lean();if(!deal)return NextResponse.json({error:"Deal not found."},{status:404});const[customer,events]=await Promise.all([Customer.findOne({_id:deal.customerId,tenantId:access.scope.tenantId}).select("name company email phone").lean(),DealEvent.find({dealId:deal._id,tenantId:access.scope.tenantId}).sort({createdAt:1}).limit(100).lean()]);return NextResponse.json({deal:{...deal,_id:String(deal._id)},customer,events},{headers:{"Cache-Control":"private, no-store"}})}catch(error){return failure(error)}
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});let access;try{access=await requireTenantAccess("deals:write")}catch(error){return failure(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});const{id}=await params;if(!/^[a-f\d]{24}$/i.test(id))return NextResponse.json({error:"Deal not found."},{status:404});
 const body=await readJsonLimited(request,10000);if(body.kind==="too-large")return NextResponse.json({error:"Request is too large."},{status:413});const parsed=patchSchema.safeParse(body.kind==="ok"?body.value:null);if(!parsed.success)return NextResponse.json({error:"Review the deal change and try again."},{status:400});if(parsed.data.action==="move"&&parsed.data.stage==="lost"&&!parsed.data.lostReason)return NextResponse.json({error:"Add a reason when marking a deal as lost."},{status:400});
 const targetStage=parsed.data.action==="move"?parsed.data.stage:null,session=await mongoose.startSession();let result:unknown;
 try{await session.withTransaction(async()=>{
  const filter:Record<string,unknown>={_id:id,tenantId:access!.scope.tenantId};if(access!.scope.role==="sales")filter.ownerId=access!.scope.userId;const deal=await Deal.findOne(filter).session(session);if(!deal)throw new Error("NOT_FOUND");let action:string,details:Record<string,unknown>={};
  if(parsed.data.action==="move"){
   const tenant=await Tenant.findById(access!.scope.tenantId).select("salesStages").session(session).lean(),stages=salesStagesFor(tenant?.salesStages as {key:string;label:string;position:number}[]|undefined),transition=canMoveDeal({from:deal.stage,to:targetStage!,stages,isOwner:access!.scope.role==="owner",lostReason:parsed.data.lostReason});
   if(!transition.ok){if(transition.reason==="unknown_stage")throw new Error("INVALID_STAGE");if(transition.reason==="reopen_requires_owner")throw new Error("FORBIDDEN");throw new Error("INVALID_TRANSITION")}
   if(transition.reason==="unchanged"){result=deal.toObject();return}
   const before=deal.stage;deal.stage=targetStage!;deal.lostReason=targetStage==="lost"?parsed.data.lostReason:"";details={from:before,to:deal.stage,...(deal.stage==="lost"?{lostReason:deal.lostReason}:{})};action="stage_changed";
  }else{
   if(parsed.data.ownerId&&access!.scope.role!=="owner")throw new Error("FORBIDDEN");const changes:Record<string,unknown>={};
   if(parsed.data.title!==undefined){deal.title=parsed.data.title;changes.title=parsed.data.title}
   if(parsed.data.valueMinor!==undefined){deal.valueMinor=parsed.data.valueMinor;changes.valueMinor=parsed.data.valueMinor}
   if(parsed.data.dueAt!==undefined){deal.set("dueAt",parsed.data.dueAt?new Date(parsed.data.dueAt):null);changes.dueAt=parsed.data.dueAt}
   if(parsed.data.ownerId){const[membership,user]=await Promise.all([Membership.findOne({tenantId:access!.scope.tenantId,userId:parsed.data.ownerId,revokedAt:null}).session(session).lean(),User.findOne({_id:parsed.data.ownerId,disabledAt:null}).select("_id").session(session).lean()]);if(!membership||!user)throw new Error("OWNER_NOT_FOUND");changes.ownerId=String(parsed.data.ownerId);deal.ownerId=new mongoose.Types.ObjectId(parsed.data.ownerId)}
   if(!Object.keys(changes).length)throw new Error("EMPTY_UPDATE");details=changes;action="updated";
  }
  deal.version+=1;await deal.save({session});await DealEvent.create([{tenantId:access!.scope.tenantId,dealId:deal._id,actorId:access!.scope.userId,action,details}],{session});await AuditEvent.create([{tenantId:access!.scope.tenantId,actorId:access!.scope.userId,action:`deal.${action}`,entityType:"deal",entityId:String(deal._id),requestId:randomBytes(12).toString("hex"),metadata:details}],{session});result=deal.toObject();
 })}catch(error){if(error instanceof Error&&error.message==="NOT_FOUND")return NextResponse.json({error:"Deal not found."},{status:404});if(error instanceof Error&&error.message==="FORBIDDEN")return NextResponse.json({error:"You cannot change this deal."},{status:403});if(error instanceof Error&&error.message==="INVALID_STAGE")return NextResponse.json({error:"That pipeline stage is no longer available."},{status:409});if(error instanceof Error&&error.message==="INVALID_TRANSITION")return NextResponse.json({error:"Move this deal through the final active stage before marking it won."},{status:409});if(error instanceof Error&&error.message==="OWNER_NOT_FOUND")return NextResponse.json({error:"The new deal owner is not an active member of this workspace."},{status:400});if(error instanceof Error&&error.message==="EMPTY_UPDATE")return NextResponse.json({error:"No deal changes were provided."},{status:400});return failure(error)}finally{await session.endSession()}
 return NextResponse.json({deal:result},{headers:{"Cache-Control":"private, no-store"}})
}
