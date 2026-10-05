import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {readSession} from "@/server/auth";
import {resolveTenantScope} from "@/server/tenant-scope";
import {can} from "@/server/permissions";
import {Tenant} from "@/server/models/Tenant";
import {Customer} from "@/server/models/Customer";
import {Quote} from "@/server/models/Quote";
import {Order} from "@/server/models/Order";
import {Payment} from "@/server/models/Payment";

export const dynamic="force-dynamic";

type DashboardMetric={key:"customers"|"openQuotes"|"netReceipts"|"openOrders";value:number|null;note:string};

function exactNumber(value:bigint){
 const number=Number(value);
 return Number.isSafeInteger(number)?number:null;
}

export async function GET(){
 try{
  const identity=await readSession();
  if(!identity)return NextResponse.json({error:"Sign in is required."},{status:401});
  const scope=await resolveTenantScope(identity,identity.tenantId);
  const tenant=await Tenant.findById(scope.tenantId).select("baseCurrency").lean();
  if(!tenant)return NextResponse.json({error:"Workspace is unavailable."},{status:404});

  const reads=[
   can(scope,"customers:read")?Customer.countDocuments({tenantId:scope.tenantId,status:{$ne:"archived"}}):Promise.resolve(null),
   can(scope,"quotes:write")?Quote.countDocuments({tenantId:scope.tenantId,status:"issued",expiresAt:{$gt:new Date()}}):Promise.resolve(null),
   can(scope,"payments:read")?Payment.aggregate([
    {$match:{tenantId:new mongoose.Types.ObjectId(scope.tenantId)}},
    {$group:{_id:"$direction",totalMinor:{$sum:{$toDecimal:"$amountMinor"}}}}
   ]):Promise.resolve(null),
   can(scope,"orders:read")?Order.countDocuments({tenantId:scope.tenantId,status:{$nin:["fulfilled","cancelled"]}}):Promise.resolve(null)
  ] as const;
  const [customers,openQuotes,paymentRows,openOrders]=await Promise.all(reads);
  const metrics:DashboardMetric[]=[];
  if(customers!==null)metrics.push({key:"customers",value:customers,note:"Active customer records"});
  if(openQuotes!==null)metrics.push({key:"openQuotes",value:openQuotes,note:"Sent quotes that have not expired"});
  if(paymentRows!==null){
   let net=0n;
   for(const row of paymentRows as {_id:"capture"|"refund";totalMinor:{toString():string}}[]){
    const amount=BigInt(row.totalMinor.toString());
    net+=row._id==="refund"?-amount:amount;
   }
   metrics.push({key:"netReceipts",value:exactNumber(net),note:"Recorded captures less refunds · all time"});
  }
  if(openOrders!==null)metrics.push({key:"openOrders",value:openOrders,note:"Orders not completed or cancelled"});
  return NextResponse.json({currency:tenant.baseCurrency,metrics},{headers:{"Cache-Control":"private, no-store"}});
 }catch{
  return NextResponse.json({error:"Workspace snapshot is temporarily unavailable."},{status:503,headers:{"Cache-Control":"private, no-store"}});
 }
}
