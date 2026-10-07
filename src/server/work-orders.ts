import type mongoose from "mongoose";
import {WorkOrder} from "@/server/models/WorkOrder";

type WorkOrderSource={
 _id:mongoose.Types.ObjectId;
 tenantId:mongoose.Types.ObjectId;
 orderNumber:string;
 customerSnapshot?:{name?:string}|null;
 createdBy?:mongoose.Types.ObjectId|null;
 lines:readonly {kind:"physical"|"service";name:string;quantity:number}[];
};

export async function ensureServiceWorkOrders(order:WorkOrderSource,session:mongoose.ClientSession,completedByLine:readonly number[]=[]){
 for(let lineIndex=0;lineIndex<order.lines.length;lineIndex++){
  const line=order.lines[lineIndex];
  if(line.kind!=="service")continue;
  const completedQuantity=Math.min(line.quantity,Math.max(0,completedByLine[lineIndex]||0));
  await WorkOrder.updateOne(
   {tenantId:order.tenantId,orderId:order._id,orderLineIndex:lineIndex},
   {$setOnInsert:{tenantId:order.tenantId,orderId:order._id,orderNumber:order.orderNumber,orderLineIndex:lineIndex,customerName:order.customerSnapshot?.name||"Customer",serviceName:line.name,quantity:line.quantity,completedQuantity,status:completedQuantity>=line.quantity?"completed":completedQuantity>0?"in_progress":"open",createdBy:order.createdBy||null}},
   {upsert:true,session}
  );
 }
}
