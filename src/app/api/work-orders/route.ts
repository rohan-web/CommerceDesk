import {NextResponse} from "next/server";
import {requireTenantAccess} from "@/server/tenant-scope";
import {Membership} from "@/server/models/Membership";
import {User} from "@/server/models/User";
import {WorkOrder} from "@/server/models/WorkOrder";
import {WorkOrderAttachment} from "@/server/models/WorkOrderAttachment";

export const dynamic="force-dynamic";
function failure(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"You do not have permission to view work orders."},{status:403});return NextResponse.json({error:"Work-order service is temporarily unavailable."},{status:503})}

export async function GET(request:Request){
 let access;try{access=await requireTenantAccess("workorders:read")}catch(error){return failure(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});
 const url=new URL(request.url),status=url.searchParams.get("status"),filter:Record<string,unknown>={tenantId:access.scope.tenantId};
 if(access.scope.role!=="owner")filter.assigneeId=access.scope.userId;
 if(["open","in_progress","completed","cancelled"].includes(status||""))filter.status=status;
 try{
  const workOrders=await WorkOrder.find(filter).sort({dueAt:1,createdAt:-1}).limit(500).lean();
  const attachments=workOrders.length?await WorkOrderAttachment.find({tenantId:access.scope.tenantId,workOrderId:{$in:workOrders.map(item=>item._id)},status:"ready"}).sort({createdAt:-1}).limit(10000).select("_id workOrderId originalName contentType sizeBytes purpose createdAt").lean():[];
  const attachmentsByWorkOrder=new Map<string,typeof attachments>();for(const attachment of attachments){const key=String(attachment.workOrderId),items=attachmentsByWorkOrder.get(key)||[];items.push(attachment);attachmentsByWorkOrder.set(key,items)}
  const memberships=access.scope.role==="owner"?await Membership.find({tenantId:access.scope.tenantId,revokedAt:null,role:{$in:["owner","operations"]}}).select("userId role").lean():[];
  const userIds=[...new Set([...workOrders.map(item=>item.assigneeId?String(item.assigneeId):""),...memberships.map(item=>String(item.userId))].filter(Boolean))];
  const users=await User.find({_id:{$in:userIds},disabledAt:null}).select("name").lean(),names=new Map(users.map(user=>[String(user._id),user.name]));
  return NextResponse.json({workOrders:workOrders.map(item=>({...item,_id:String(item._id),orderId:String(item.orderId),assigneeId:item.assigneeId?String(item.assigneeId):null,assigneeName:item.assigneeId?names.get(String(item.assigneeId))||"Former teammate":null,createdBy:undefined,tasks:item.tasks.map(task=>({_id:String(task._id),title:task.title,createdAt:task.createdAt,completedAt:task.completedAt})),attachments:(attachmentsByWorkOrder.get(String(item._id))||[]).map(file=>({id:String(file._id),name:file.originalName,contentType:file.contentType,sizeBytes:file.sizeBytes,purpose:file.purpose,createdAt:file.createdAt}))})),assignees:memberships.map(item=>({id:String(item.userId),name:names.get(String(item.userId))||"Inactive teammate",role:item.role})).filter(item=>item.name!=="Inactive teammate"),role:access.scope.role},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return failure(error)}
}
