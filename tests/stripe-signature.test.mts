import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {verifyStripeWebhookSignature} from "../src/server/stripe-signature.ts";

const secret="whsec_test_secret",raw=JSON.stringify({id:"evt_123",type:"payment_intent.succeeded"});
function signature(timestamp:number,body=raw){return `t=${timestamp},v1=${createHmac("sha256",secret).update(`${timestamp}.${body}`).digest("hex")}`}
test("Stripe signature accepts the exact raw body within the tolerance window",()=>{assert.equal(verifyStripeWebhookSignature(raw,signature(1_800_000_000),secret,1_800_000_100),true)});
test("Stripe signature rejects changed body, secret, and stale timestamp",()=>{assert.equal(verifyStripeWebhookSignature(`${raw} `,signature(1_800_000_000),secret,1_800_000_100),false);assert.equal(verifyStripeWebhookSignature(raw,signature(1_800_000_000),"whsec_other",1_800_000_100),false);assert.equal(verifyStripeWebhookSignature(raw,signature(1_800_000_000),secret,1_800_000_301),false)});
test("Stripe signature supports multiple v1 values and rejects malformed headers",()=>{const valid=signature(1_800_000_000),header=`t=1800000000,v1=${"0".repeat(64)},${valid.slice(valid.indexOf(",")+1)}`;assert.equal(verifyStripeWebhookSignature(raw,header,secret,1_800_000_001),true);assert.equal(verifyStripeWebhookSignature(raw,"v1=bad",secret,1_800_000_001),false)});
