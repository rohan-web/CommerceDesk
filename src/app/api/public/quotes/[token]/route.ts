import {createHash,randomBytes} from "node:crypto";
import mongoose from "mongoose";
import {NextResponse} from "next/server";
import {z} from "zod";
import {connectDatabase} from "@/server/db";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import {Quote} from "@/server/models/Quote";
import {QuoteRevision} from "@/server/models/QuoteRevision";
import {QuoteCustomerRequest} from "@/server/models/QuoteCustomerRequest";
import {AuditEvent} from "@/server/models/AuditEvent";
type Context={params:Promise<{token:string}>};
export const dynamic="force-dynamic";
const responseSchema=z.discriminatedUnion("action",[z.object({action:z.literal("accept"),acceptedByName:z.string().trim().min(2).max(160),confirmed:z.literal(true)}).strict(),z.object({action:z.literal("request_revision"),requesterName:z.string().trim().min(2).max(160),message:z.string().trim().min(2).max(1200)}).strict()]);
function tokenHash(value:string){return createHash("sha256").update(value).digest("hex")}
export async function GET(_request:Request,context:Context){const{token}=await context.params;if(!/^[a-f\d]{64}$/i.test(token))return NextResponse.json({error:"This quote link is invalid or has been replaced."},{status:404});try{await connectDatabase();const quote=await Quote.findOne({acceptTokenHash:tokenHash(token)}).lean();if(!quote)return NextResponse.json({error:"This quote link is invalid or has been replaced."},{status:404});if(quote.status==="issued"&&quote.expiresAt<=new Date())return NextResponse.json({error:"This quote has expired."},{status:410});if(!["issued","revision_requested","accepted","converted"].includes(quote.status))return NextResponse.json({error:"This quote is not available."},{status:410});const revision=await QuoteRevision.findOne({tenantId:quote.tenantId,quoteId:quote._id,revision:quote.currentRevision}).lean();if(!revision)return NextResponse.json({error:"This quote revision is unavailable."},{status:410});return NextResponse.json({quote:{quoteNumber:quote.quoteNumber,status:quote.status,acceptedByName:quote.acceptedByName,revisionRequest:quote.status==="revision_requested"?{requesterName:quote.revisionRequestByName,message:quote.revisionRequestNote,requestedAt:quote.revisionRequestAt}:null,revision:{revision:revision.revision,customerName:revision.customerSnapshot?.name??"Customer",lines:revision.lines,subtotalMinor:revision.subtotalMinor,taxMinor:revision.taxMinor,totalMinor:revision.totalMinor,depositPercentBps:revision.depositPercentBps||0,depositDueMinor:revision.depositDueMinor||revision.totalMinor,currency:revision.currency,terms:revision.terms,expiresAt:revision.expiresAt}}},{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}})}catch{return NextResponse.json({error:"Quote service is temporarily unavailable."},{status:503})}}
export async function POST(request:Request,context:Context){
 if(!isSameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
 const{token}=await context.params;if(!/^[a-f\d]{64}$/i.test(token))return NextResponse.json({error:"This quote link is invalid or has been replaced."},{status:404});
 const limited=await readJsonLimited(request,4096);if(limited.kind==="too-large")return NextResponse.json({error:"Request is too large."},{status:413});
 const parsed=responseSchema.safeParse(limited.kind==="ok"?limited.value:null);if(!parsed.success)return NextResponse.json({error:"Review your response and try again."},{status:400});
 let dbSession:mongoose.ClientSession|undefined;
 try{
  await connectDatabase();dbSession=await mongoose.startSession();let result:{status:string;quoteNumber:string}|null=null;
  await dbSession.withTransaction(async()=>{
   const quote=await Quote.findOne({acceptTokenHash:tokenHash(token)}).session(dbSession!);if(!quote)throw new Error("QUOTE_LINK_INVALID");
   if(parsed.data.action==="request_revision"){
    if(quote.status==="revision_requested"){result={status:quote.status,quoteNumber:quote.quoteNumber};return}
    if(quote.status!=="issued"||quote.expiresAt<=new Date())throw new Error("QUOTE_NOT_ACCEPTABLE");
    const revision=await QuoteRevision.findOne({tenantId:quote.tenantId,quoteId:quote._id,revision:quote.currentRevision}).select("revision").session(dbSession!).lean();if(!revision)throw new Error("QUOTE_REVISION_MISSING");
    await QuoteCustomerRequest.create([{tenantId:quote.tenantId,quoteId:quote._id,quoteRevision:revision.revision,requesterName:parsed.data.requesterName,message:parsed.data.message,status:"open"}],{session:dbSession!});
    quote.status="revision_requested";quote.revisionRequestNote=parsed.data.message;quote.revisionRequestAt=new Date();quote.revisionRequestByName=parsed.data.requesterName;await quote.save({session:dbSession!});
    await AuditEvent.create([{tenantId:quote.tenantId,actorId:null,action:"quote.customer_revision_requested",entityType:"quote",entityId:String(quote._id),requestId:randomBytes(12).toString("hex"),metadata:{quoteNumber:quote.quoteNumber,revision:revision.revision,requesterName:parsed.data.requesterName}}],{session:dbSession!});result={status:quote.status,quoteNumber:quote.quoteNumber};return;
   }
   if(quote.status==="accepted"||quote.status==="converted"){result={status:quote.status,quoteNumber:quote.quoteNumber};return}
   if(quote.status!=="issued"||quote.expiresAt<=new Date())throw new Error("QUOTE_NOT_ACCEPTABLE");
   quote.status="accepted";quote.acceptedRevision=quote.currentRevision;quote.acceptedAt=new Date();quote.acceptedByName=parsed.data.acceptedByName;await quote.save({session:dbSession!});
   await AuditEvent.create([{tenantId:quote.tenantId,actorId:null,action:"quote.customer_accepted",entityType:"quote",entityId:String(quote._id),requestId:randomBytes(12).toString("hex"),metadata:{quoteNumber:quote.quoteNumber,revision:quote.currentRevision,acceptedByName:parsed.data.acceptedByName,source:"private_share_link"}}],{session:dbSession!});result={status:quote.status,quoteNumber:quote.quoteNumber};
  });
  return NextResponse.json({ok:true,...(result??{})},{status:parsed.data.action==="request_revision"?201:200,headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
 }catch(error){
  if(error instanceof Error&&error.message==="QUOTE_LINK_INVALID")return NextResponse.json({error:"This quote link is invalid or has been replaced."},{status:404});
  if(error instanceof Error&&error.message==="QUOTE_NOT_ACCEPTABLE")return NextResponse.json({error:"This quote is no longer accepting responses."},{status:410});
  if(error instanceof Error&&error.message==="QUOTE_REVISION_MISSING")return NextResponse.json({error:"This quote revision is unavailable."},{status:410});
  if((error as {code?:number})?.code===11000)return NextResponse.json({error:"A revision request was already submitted for this quote revision."},{status:409});
  return NextResponse.json({error:"Quote response could not be recorded."},{status:503});
 }finally{await dbSession?.endSession()}
}