import {connectDatabase} from "../server/db";
import {WorkOrderAttachment} from "../server/models/WorkOrderAttachment";
import {listPrivateEvidenceFiles,removePrivateEvidence,type PrivateEvidenceType} from "../server/private-files";

const ORPHAN_RETENTION_MS=24*60*60*1000;
const DELETION_RETRY_MS=15*60*1000;

export async function sweepPrivateWorkOrderFiles(now=new Date()){
 await connectDatabase();let removed=0,failed=0;
 const retryable=await WorkOrderAttachment.find({status:"deleted",deletedAt:{$lte:new Date(now.getTime()-DELETION_RETRY_MS)}}).sort({deletedAt:1}).limit(100).select("_id storageKey contentType").lean();
 for(const attachment of retryable){try{await removePrivateEvidence(attachment.storageKey,attachment.contentType as PrivateEvidenceType);await WorkOrderAttachment.deleteOne({_id:attachment._id,status:"deleted"});removed++}catch{failed++}}
 const files=await listPrivateEvidenceFiles(250),expired=files.filter(file=>file.modifiedAt.getTime()<=now.getTime()-ORPHAN_RETENTION_MS);
 if(expired.length){const referenced=await WorkOrderAttachment.find({storageKey:{$in:expired.map(file=>file.storageKey)}}).distinct("storageKey"),used=new Set(referenced);for(const file of expired){if(used.has(file.storageKey))continue;try{await removePrivateEvidence(file.storageKey,file.contentType);removed++}catch{failed++}}}
 if(removed||failed)console.info(JSON.stringify({level:"info",event:"private_work_order_file_sweep",removed,failed,checked:files.length}));
}
