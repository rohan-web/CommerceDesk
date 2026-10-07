import test from "node:test";
import assert from "node:assert/strict";
import {initialStorefrontPaymentMinor,nextStorefrontPaymentMinor} from "../src/server/domain/storefront-payments.ts";

test("full payment policy collects the entire order and deposit policy rounds up minor units",()=>{
 assert.equal(initialStorefrontPaymentMinor(10001,"full",3000),10001);
 assert.equal(initialStorefrontPaymentMinor(10001,"deposit",3000),3001);
 assert.equal(initialStorefrontPaymentMinor(1,"deposit",1),1);
});
test("deposit collection requests only the initial amount, then the remaining balance",()=>{
 assert.equal(nextStorefrontPaymentMinor(10000,0,0,3000),3000);
 assert.equal(nextStorefrontPaymentMinor(10000,1000,0,3000),2000);
 assert.equal(nextStorefrontPaymentMinor(10000,3000,0,3000),7000);
 assert.equal(nextStorefrontPaymentMinor(10000,10000,0,3000),0);
});
test("storefront payment due never exceeds the outstanding payable amount",()=>{
 assert.equal(nextStorefrontPaymentMinor(10000,6000,0,3000),4000);
 assert.equal(nextStorefrontPaymentMinor(10000,7000,500,3000),3500);
 assert.throws(()=>nextStorefrontPaymentMinor(10000,1000,2000,3000),RangeError);
 assert.equal(initialStorefrontPaymentMinor(Number.MAX_SAFE_INTEGER,"deposit",5000),4503599627370496);
});
