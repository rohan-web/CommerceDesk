import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {createRequire} from "node:module";
import {mkdir,stat,utimes,writeFile} from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
const require=createRequire(import.meta.url);
const {sweepPrivateWorkOrderFiles}=require("../src/worker/private-files.ts") as {sweepPrivateWorkOrderFiles:()=>Promise<void>};

const uri=process.env.MONGODB_URI,base=process.env.APP_URL;
assert.ok(uri&&base,"Set MONGODB_URI and APP_URL to isolated test services.");
await mongoose.connect(uri);
const db=mongoose.connection.db!;
assert.match(db.databaseName,/attachment|file/i,"Refusing to clear a database without an attachment/file test name.");
await db.dropDatabase();
const id=()=>new mongoose.Types.ObjectId(),now=new Date(),tenantA=id(),tenantB=id();
await db.collection("tenants").insertMany([
 {_id:tenantA,name:"Attachment Acceptance",slug:"attachment-acceptance",deploymentMode:"standalone",commerceMode:"native",baseCurrency:"USD",timezone:"UTC",createdAt:now,updatedAt:now},
 {_id:tenantB,name:"Foreign Tenant",slug:"foreign-attachment-tenant",deploymentMode:"standalone",commerceMode:"native",baseCurrency:"USD",timezone:"UTC",createdAt:now,updatedAt:now}
]);
const owner={_id:id()},operator={_id:id()},otherOperator={_id:id()},foreignOwner={_id:id()};
await db.collection("users").insertMany([
 {...owner,name:"Owner",email:"owner@attachment.test",passwordHash:"unused",mfaRecoveryHashes:[],mfaLastCounter:-1,createdAt:now,updatedAt:now},
 {...operator,name:"Assigned operator",email:"assigned@attachment.test",passwordHash:"unused",mfaRecoveryHashes:[],mfaLastCounter:-1,createdAt:now,updatedAt:now},
 {...otherOperator,name:"Other operator",email:"other@attachment.test",passwordHash:"unused",mfaRecoveryHashes:[],mfaLastCounter:-1,createdAt:now,updatedAt:now},
 {...foreignOwner,name:"Foreign owner",email:"foreign@attachment.test",passwordHash:"unused",mfaRecoveryHashes:[],mfaLastCounter:-1,createdAt:now,updatedAt:now}
]);
await db.collection("memberships").insertMany([
 {tenantId:tenantA,userId:owner._id,role:"owner",permissions:[],revokedAt:null,createdAt:now,updatedAt:now},
 {tenantId:tenantA,userId:operator._id,role:"operations",permissions:[],revokedAt:null,createdAt:now,updatedAt:now},
 {tenantId:tenantA,userId:otherOperator._id,role:"operations",permissions:[],revokedAt:null,createdAt:now,updatedAt:now},
 {tenantId:tenantB,userId:foreignOwner._id,role:"owner",permissions:[],revokedAt:null,createdAt:now,updatedAt:now}
]);
const cookies=new Map<string,string>();
for(const [key,user,tenant] of [["owner",owner,tenantA],["operator",operator,tenantA],["other",otherOperator,tenantA],["foreign",foreignOwner,tenantB]] as const){const token=randomBytes(32).toString("base64url");cookies.set(key,token);await db.collection("sessions").insertOne({userId:user._id,tenantId:tenant,tokenHash:createHash("sha256").update(token).digest("hex"),expiresAt:new Date(Date.now()+600_000),revokedAt:null,createdAt:now})}
const workOrder={_id:id()};
await db.collection("workorders").insertOne({_id:workOrder._id,tenantId:tenantA,orderId:id(),orderNumber:"CD-ATTACH-01",orderLineIndex:0,customerName:"Acceptance customer",serviceName:"Install service",quantity:1,completedQuantity:0,attachmentCount:0,status:"open",assigneeId:operator._id,dueAt:null,tasks:[],createdBy:owner._id,createdAt:now,updatedAt:now,version:0});
const orderId=id();
await db.collection("orders").insertOne({_id:orderId,tenantId:tenantA,orderNumber:"CD-PACK-01",customerId:null,customerSnapshot:{name:"Packing customer",email:"private@example.test",phone:null},lines:[{itemId:id(),variantId:null,variantName:null,variantOptions:[],kind:"physical",name:"Stoneware cup",sku:"CUP-01",quantity:4,unitPriceMinor:1200,discountPercentBps:0,discountAmountMinor:0,taxRateBps:0,taxMode:"exclusive",netMinor:4800,taxMinor:0,grossMinor:4800,tracksStock:false}],currency:"USD",subtotalMinor:4800,taxMinor:0,shippingFeeMinor:0,totalMinor:4800,source:"workspace",fulfilmentMethod:"delivery",shippingAddress:{recipient:"Packing customer",line1:"12 Main Street",line2:"Unit 4",city:"Riverton",region:"CA",postalCode:"90210",countryCode:"US"},paymentMethod:null,paymentInstructionsSnapshot:"",storefrontTermsSnapshot:"",storefrontPrivacySnapshot:"",policyVersion:null,status:"open",paymentStatus:"unpaid",fulfilmentStatus:"partially_fulfilled",fulfilments:[{eventType:"dispatch",idempotencyKey:"acceptance-dispatch-1",requestFingerprint:"a".repeat(64),actorId:operator._id,occurredAt:now,note:"",lines:[{lineIndex:0,quantity:2}]}],depositDueMinor:0,sourceQuoteId:null,sourceQuoteRevision:null,idempotencyKey:"acceptance-order",requestFingerprint:"b".repeat(64),createdBy:owner._id,createdAt:now,updatedAt:now,version:0});
const headers=(key:string,extra:Record<string,string>={})=>({origin:base!,cookie:`cd_session=${cookies.get(key)}`,...extra});
const endpoint=`${base}/api/work-orders/${workOrder._id}/attachments`;
const packingEndpoint=`${base}/api/orders/${orderId}/packing-slip`;
const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
const upload=async(key:string,name="proof.png",purpose="completion_evidence")=>{const form=new FormData();form.set("file",new File([png],name,{type:"image/png"}));form.set("purpose",purpose);return fetch(endpoint,{method:"POST",headers:headers(key),body:form})};
try{
 const denied=await upload("other");assert.equal(denied.status,403,"Unassigned operators cannot upload files");
 const badType=new FormData();badType.set("file",new File(["plain text"],"proof.txt",{type:"text/plain"}));badType.set("purpose","supporting");assert.equal((await fetch(endpoint,{method:"POST",headers:headers("operator"),body:badType})).status,415,"Content type is detected from file bytes");
 const uploaded=await upload("operator","../service-proof.png");const uploadText=await uploaded.text();assert.equal(uploaded.status,201,uploadText);const {attachment}=JSON.parse(uploadText) as {attachment:{id:string;name:string}};assert.equal(attachment.name,"_service-proof.png");
 const listed=await fetch(`${base}/api/work-orders`,{headers:headers("operator")});assert.equal(listed.status,200);const listData=await listed.json() as {workOrders:Array<{_id:string;attachments:Array<Record<string,unknown>>}>};const listedFile=listData.workOrders.find(item=>item._id===String(workOrder._id))?.attachments[0];assert.ok(listedFile);assert.equal("storageKey" in listedFile!,false);assert.equal("sha256" in listedFile!,false);
 const download=await fetch(`${endpoint}/${attachment.id}`,{headers:headers("operator")});assert.equal(download.status,200);assert.deepEqual(new Uint8Array(await download.arrayBuffer()),png);assert.match(download.headers.get("content-disposition")||"",/^attachment;/);assert.equal(download.headers.get("x-content-type-options"),"nosniff");
 assert.equal((await fetch(`${endpoint}/${attachment.id}`,{headers:headers("other")})).status,403,"Unassigned operators cannot download files");assert.equal((await fetch(`${base}/api/work-orders/${workOrder._id}/attachments/${attachment.id}`,{headers:headers("foreign")})).status,404,"Other tenants cannot discover file metadata");assert.equal((await fetch(`${endpoint}/${attachment.id}`,{method:"DELETE",headers:headers("other")})).status,403,"Unassigned operators cannot delete files");
 assert.equal((await fetch(`${endpoint}/${attachment.id}`,{method:"DELETE",headers:headers("operator")})).status,200,"Assigned operator can remove a file");assert.equal((await fetch(`${endpoint}/${attachment.id}`,{headers:headers("operator")})).status,404,"Removed files are no longer downloadable");assert.equal((await upload("operator","restored-proof.png")).status,201,"Deleting a file releases a work-order attachment slot");
 const packingResponse=await fetch(packingEndpoint,{headers:headers("operator")});assert.equal(packingResponse.status,200);const {packingSlip}=await packingResponse.json() as {packingSlip:{orderNumber:string;items:{name:string;quantity:number;unitPriceMinor?:number}[];shippingAddress:{line1:string};paymentStatus?:string;totalMinor?:number}};assert.equal(packingSlip.orderNumber,"CD-PACK-01");assert.deepEqual(packingSlip.items.map(item=>({name:item.name,quantity:item.quantity})),[{name:"Stoneware cup",quantity:2}]);assert.equal(packingSlip.shippingAddress.line1,"12 Main Street");assert.equal("paymentStatus" in packingSlip,false);assert.equal("totalMinor" in packingSlip,false);assert.equal("unitPriceMinor" in packingSlip.items[0],false);assert.equal((await fetch(packingEndpoint,{headers:headers("foreign")})).status,404,"Other tenants cannot access packing details");
 assert.equal((await upload("owner","owner-proof.png","supporting")).status,201,"Owner can upload files");
  for(let index=2;index<20;index++){const response=await upload("operator",`file-${index}.png`,"supporting");assert.equal(response.status,201,`File ${index} should be accepted`)}
 assert.equal((await upload("operator","21.png","supporting")).status,409,"Concurrent-safe per-work-order file limit is enforced");
 const uploadRoot=process.env.UPLOAD_DIR!;await mkdir(uploadRoot,{recursive:true});const retiredKey=randomBytes(32).toString("hex"),orphanKey=randomBytes(32).toString("hex"),retiredPath=path.join(uploadRoot,`${retiredKey}.png`),orphanPath=path.join(uploadRoot,`${orphanKey}.png`),oldTime=new Date(Date.now()-26*60*60*1000);
 await writeFile(retiredPath,png);await writeFile(orphanPath,png);await utimes(orphanPath,oldTime,oldTime);await db.collection("workorderattachments").insertOne({_id:id(),tenantId:tenantA,workOrderId:workOrder._id,storageKey:retiredKey,originalName:"removed.png",contentType:"image/png",sizeBytes:png.byteLength,sha256:createHash("sha256").update(png).digest("hex"),purpose:"supporting",uploadedBy:operator._id,status:"deleted",deletedAt:new Date(Date.now()-16*60*1000),createdAt:oldTime});
 await sweepPrivateWorkOrderFiles();await assert.rejects(stat(retiredPath),{code:"ENOENT"},"Worker retries incomplete physical deletions");await assert.rejects(stat(orphanPath),{code:"ENOENT"},"Worker purges unreferenced files older than 24 hours");assert.equal(await db.collection("workorderattachments").countDocuments({storageKey:retiredKey}),0);
 console.log("WORK_ORDER_ATTACHMENT_ACCEPTANCE_OK: assigned operator and owner upload/download/delete, signature/type rejection, filename sanitization, metadata privacy, authenticated private download headers, unassigned operator denial, cross-tenant 404, slot release on deletion, worker retry and orphan sweeps, packing-slip dispatch quantities and address privacy, and 20-file limit.");
}finally{await db.dropDatabase();await mongoose.disconnect()}
