/** Rejects state-changing browser requests from an origin other than the configured app. */
export function isSameOrigin(request:Request){
 const configured=process.env.APP_URL;
 if(!configured)return false;
 try{return request.headers.get("origin")===new URL(configured).origin}catch{return false}
}

export type LimitedJsonResult={kind:"ok";value:unknown}|{kind:"too-large"}|{kind:"invalid"};
/** Reads and parses a JSON body while enforcing the limit even when Content-Length is absent or false. */
export async function readJsonLimited(request:Request,maxBytes:number):Promise<LimitedJsonResult>{
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new RangeError("maxBytes must be a positive safe integer.");
 if(!request.body)return{kind:"invalid"};
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();return{kind:"too-large"}}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  return{kind:"ok",value:JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes))};
 }catch{return{kind:"invalid"}}finally{try{reader.releaseLock()}catch{}}
}
