import {createHmac,timingSafeEqual} from "node:crypto";

/** Verifies Stripe's signature against the exact UTF-8 body and a bounded timestamp window. */
export function verifyStripeWebhookSignature(rawBody:string,signatureHeader:string,secret:string,nowSeconds=Math.floor(Date.now()/1000),toleranceSeconds=300){
 if(!secret||!rawBody||!signatureHeader||!Number.isSafeInteger(nowSeconds)||toleranceSeconds<1)return false;
 const parts=signatureHeader.split(",").map(part=>part.trim()),timestampPart=parts.find(part=>part.startsWith("t=")),timestampText=timestampPart?.slice(2)??"",timestamp=Number(timestampText);
 if(!/^\d{1,12}$/.test(timestampText)||!Number.isSafeInteger(timestamp)||Math.abs(nowSeconds-timestamp)>toleranceSeconds)return false;
 const payload=`${timestamp}.${rawBody}`,expected=createHmac("sha256",secret).update(payload,"utf8").digest();
 for(const part of parts){if(!part.startsWith("v1="))continue;const hex=part.slice(3);if(!/^[0-9a-f]{64}$/i.test(hex))continue;const candidate=Buffer.from(hex,"hex");if(candidate.length===expected.length&&timingSafeEqual(candidate,expected))return true}
 return false;
}
