import {randomBytes,scrypt as rawScrypt,timingSafeEqual,createHash,createCipheriv,createDecipheriv} from "node:crypto";
function derive(password:string,salt:Buffer){return new Promise<Buffer>((resolve,reject)=>rawScrypt(password,salt,64,(err,key)=>err?reject(err):resolve(key as Buffer)))}
export async function hashPassword(password:string){const salt=randomBytes(16);const key=await derive(password,salt);return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`}
export async function verifyPassword(password:string,stored:string){const parts=stored.split("$");if(parts.length!==3||parts[0]!=="scrypt")return false;try{const expected=Buffer.from(parts[2],"base64url");const actual=await derive(password,Buffer.from(parts[1],"base64url"));return expected.length===actual.length&&timingSafeEqual(expected,actual)}catch{return false}}
export const hashSessionToken=(token:string)=>createHash("sha256").update(token).digest("hex");
export const newSessionToken=()=>randomBytes(32).toString("base64url");
function encryptionKey(){const key=Buffer.from(process.env.APP_ENCRYPTION_KEY||"","base64url");if(key.length!==32)throw new Error("APP_ENCRYPTION_KEY must be a base64url-encoded 32-byte key.");return key}
export function hasValidEncryptionKey(){try{encryptionKey();return true}catch{return false}}
export function encryptSecret(value:string){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv),encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`}
export function decryptSecret(value:string){const[version,ivText,tagText,cipherText]=value.split(":");if(version!=="v1"||!ivText||!tagText||!cipherText)throw new Error("Encrypted value has an unsupported format.");const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(ivText,"base64url"));decipher.setAuthTag(Buffer.from(tagText,"base64url"));return Buffer.concat([decipher.update(Buffer.from(cipherText,"base64url")),decipher.final()]).toString("utf8")}

