import {createHash,randomBytes} from "node:crypto";
import {mkdir,readdir,readFile,stat,unlink,writeFile} from "node:fs/promises";
import path from "node:path";

export const MAX_PRIVATE_FILE_BYTES=10*1024*1024;
export type PrivateEvidenceType="application/pdf"|"image/png"|"image/jpeg"|"image/webp";
const extensions:Record<PrivateEvidenceType,string>={"application/pdf":"pdf","image/png":"png","image/jpeg":"jpg","image/webp":"webp"};
const typesByExtension:Record<string,PrivateEvidenceType>=Object.fromEntries(Object.entries(extensions).map(([type,extension])=>[extension,type])) as Record<string,PrivateEvidenceType>;

export function detectPrivateEvidenceType(bytes:Uint8Array):PrivateEvidenceType|null{
 if(bytes.length>=5&&Buffer.from(bytes.subarray(0,5)).toString("ascii")==="%PDF-")return "application/pdf";
 if(bytes.length>=8&&Buffer.from(bytes.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "image/png";
 if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return "image/jpeg";
 if(bytes.length>=12&&Buffer.from(bytes.subarray(0,4)).toString("ascii")==="RIFF"&&Buffer.from(bytes.subarray(8,12)).toString("ascii")==="WEBP")return "image/webp";
 return null;
}

export function safePrivateFileName(value:string){
 const cleaned=value.normalize("NFKC").replace(/[\\/]/g,"_").replace(/[\u0000-\u001f\u007f]/g,"").replace(/[^\p{L}\p{N}._() -]/gu,"_").replace(/^\.+/,"").trim().slice(0,120);
 return cleaned||"evidence-file";
}

function storagePath(storageKey:string,contentType:PrivateEvidenceType){
 if(!/^[a-f\d]{64}$/.test(storageKey))throw new Error("INVALID_PRIVATE_STORAGE_KEY");
 const root=path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR?.trim()||path.join(process.cwd(),"private_uploads")),candidate=path.resolve(root,`${storageKey}.${extensions[contentType]}`);
 if(!candidate.startsWith(root+path.sep))throw new Error("INVALID_PRIVATE_STORAGE_PATH");
 return {root,candidate};
}

export function privateFileHash(bytes:Uint8Array){return createHash("sha256").update(bytes).digest("hex")}

export async function writePrivateEvidence(bytes:Uint8Array,contentType:PrivateEvidenceType){
 if(bytes.byteLength<1||bytes.byteLength>MAX_PRIVATE_FILE_BYTES)throw new Error("PRIVATE_FILE_SIZE_INVALID");
 const {root,candidate}=storagePath(randomBytes(32).toString("hex"),contentType);
 await mkdir(root,{recursive:true,mode:0o700});
 await writeFile(/*turbopackIgnore: true*/ candidate,bytes,{flag:"wx",mode:0o600});
 return {storageKey:path.basename(candidate,`.${extensions[contentType]}`),path:candidate};
}

export async function readPrivateEvidence(storageKey:string,contentType:PrivateEvidenceType){
 const {candidate}=storagePath(storageKey,contentType);
 return readFile(/*turbopackIgnore: true*/ candidate);
}

export async function removePrivateEvidence(storageKey:string,contentType:PrivateEvidenceType){
 const {candidate}=storagePath(storageKey,contentType);
 await unlink(/*turbopackIgnore: true*/ candidate).catch(error=>{if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error});
}

export async function listPrivateEvidenceFiles(limit=250){
 const root=path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR?.trim()||path.join(process.cwd(),"private_uploads"));
 const entries=await readdir(/*turbopackIgnore: true*/ root,{withFileTypes:true}).catch(error=>{if((error as NodeJS.ErrnoException).code==="ENOENT")return [];throw error});
 const files=entries.flatMap(entry=>{if(!entry.isFile())return [];const match=/^([a-f\d]{64})\.(pdf|png|jpg|webp)$/.exec(entry.name);if(!match)return [];const contentType=typesByExtension[match[2]];return contentType?[{storageKey:match[1],contentType,filename:entry.name}]:[]});
 const withTimes=await Promise.all(files.map(async file=>{const {candidate}=storagePath(file.storageKey,file.contentType);try{return {...file,modifiedAt:(await stat(/*turbopackIgnore: true*/ candidate)).mtime}}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error}}));
 return withTimes.filter((file):file is NonNullable<typeof file>=>!!file).sort((left,right)=>left.modifiedAt.getTime()-right.modifiedAt.getTime()).slice(0,Math.max(1,Math.min(1000,limit)));
}
