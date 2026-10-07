import {randomBytes} from "node:crypto";
import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {z} from "zod";
import {requireTenantAccess} from "@/server/tenant-scope";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import {Membership} from "@/server/models/Membership";
import {User} from "@/server/models/User";
import {WorkOrder} from "@/server/models/WorkOrder";
import {AuditEvent} from "@/server/models/AuditEvent";

type Context={params:Promise<{id:string}>};
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("assign"),assigneeId:z.string().regex(/^[a-f\d]{24}$/i).nullable()}).strict(),
 z.object({action:z.literal("set_due_date"),dueAt:z.string().datetime({offset:true}).nullable()}).strict(),
 z.object({action:z.literal("add_task"),title:z.string().trim().min(2).max(180)}).strict(),
 z.object({action:z.literal("complete_task"),taskId:z.string().regex(/^[a-f\d]{24}$/i),completed:z.boolean()}).strict()
]);
function failure(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"You do not have permission to update work orders."},{status:403});return NextResponse.json({error:"Work-order service is temporarily unavailable."},{status:503})}

export async function POST(request:Request,context:Context){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
 const{id}=await context.params;if(!mongoose.isValidObjectId(id))return NextResponse.json({error:"Work order not found."},{status:404});
 let access;try{access=await requireTenantAccess("workorders:write")}catch(error){return failure(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 const body=await readJsonLimited(request,16000);if(body.kind==="too-large")return NextResponse.json({error:"Request is too large."},{status:413});
 const parsed=schema.safeParse(body.kind==="ok"?body.value:null);if(!parsed.success)return NextResponse.json({error:"Review the work-order update and try again."},{status:400});
 if(parsed.data.action==="assign"&&access.scope.role!=="owner")return NextResponse.json({error:"Only an owner can assign work orders."},{status:403});
 const session=await mongoose.startSession();let status=200;
 try{await session.withTransaction(async()=>{
  const workOrder=await WorkOrder.findOne({_id:id,tenantId:access!.scope.tenantId}).session(session);if(!workOrder)throw new Error("WORK_ORDER_NOT_FOUND");
  if(access!.scope.role!=="owner"&&String(workOrder.assigneeId)!==access!.scope.userId)throw new Error("WORK_ORDER_NOT_ASSIGNED");
  if(workOrder.status==="completed"||workOrder.status==="cancelled")throw new Error("WORK_ORDER_CLOSED");
  const action=parsed.data.action;let auditAction="work_order.updated";const metadata:Record<string,unknown>={orderNumber:workOrder.orderNumber,serviceName:workOrder.serviceName};
  if(action==="assign"){
   if(parsed.data.assigneeId){const [membership,user]=await Promise.all([Membership.findOne({tenantId:access!.scope.tenantId,userId:parsed.data.assigneeId,revokedAt:null,role:{$in:["owner","operations"]}}).session(session).lean(),User.findOne({_id:parsed.data.assigneeId,disabledAt:null}).select("_id").session(session).lean()]);if(!membership||!user)throw new Error("ASSIGNEE_NOT_AVAILABLE")}
   workOrder.set("assigneeId",parsed.data.assigneeId?new mongoose.Types.ObjectId(parsed.data.assigneeId):null);auditAction="work_order.assigned";metadata.assigneeId=parsed.data.assigneeId;
  }else if(action==="set_due_date"){
   const dueAt=parsed.data.dueAt?new Date(parsed.data.dueAt):null;workOrder.set("dueAt",dueAt);auditAction="work_order.due_date_set";metadata.dueAt=dueAt?.toISOString()||null;
  }else if(action==="add_task"){
   if(workOrder.tasks.length>=100)throw new Error("TASK_LIMIT");workOrder.tasks.push({title:parsed.data.title,createdBy:access!.scope.userId,createdAt:new Date(),completedAt:null,completedBy:null});auditAction="work_order.task_added";metadata.title=parsed.data.title;status=201;
  }else{
   const task=workOrder.tasks.id(parsed.data.taskId);if(!task)throw new Error("TASK_NOT_FOUND");task.set("completedAt",parsed.data.completed?new Date():null);task.set("completedBy",parsed.data.completed?new mongoose.Types.ObjectId(access!.scope.userId):null);auditAction=parsed.data.completed?"work_order.task_completed":"work_order.task_reopened";metadata.taskId=parsed.data.taskId;
  }
  workOrder.increment();await workOrder.save({session});await AuditEvent.create([{tenantId:access!.scope.tenantId,actorId:access!.scope.userId,action:auditAction,entityType:"work_order",entityId:String(workOrder._id),requestId:randomBytes(12).toString("hex"),metadata}],{session});
 })}catch(error){if(error instanceof Error&&error.message==="WORK_ORDER_NOT_FOUND")return NextResponse.json({error:"Work order not found."},{status:404});if(error instanceof Error&&error.message==="WORK_ORDER_NOT_ASSIGNED")return NextResponse.json({error:"This work order is assigned to another operator."},{status:403});if(error instanceof Error&&error.message==="WORK_ORDER_CLOSED")return NextResponse.json({error:"Completed or cancelled work orders cannot be changed."},{status:409});if(error instanceof Error&&error.message==="ASSIGNEE_NOT_AVAILABLE")return NextResponse.json({error:"Choose an active owner or operations teammate."},{status:400});if(error instanceof Error&&error.message==="TASK_LIMIT")return NextResponse.json({error:"This work order already has the maximum number of tasks."},{status:409});if(error instanceof Error&&error.message==="TASK_NOT_FOUND")return NextResponse.json({error:"Task not found."},{status:404});return failure(error)}finally{await session.endSession()}
 return NextResponse.json({ok:true},{status,headers:{"Cache-Control":"private, no-store"}});
}
