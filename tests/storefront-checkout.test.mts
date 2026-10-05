import assert from "node:assert/strict";
import test from "node:test";
import {calculateStorefrontTotals,storefrontPolicyVersion} from "../src/server/domain/storefront-checkout.ts";

test("calculates mixed inclusive, exclusive, and delivery tax using minor units",()=>{
 const result=calculateStorefrontTotals([
  {unitPriceMinor:1000,quantity:2,taxRateBps:1000,taxMode:"exclusive"},
  {unitPriceMinor:1100,quantity:1,taxRateBps:1000,taxMode:"inclusive"},
 ],"USD",{unitPriceMinor:500,quantity:1,taxRateBps:1000,taxMode:"exclusive"});
 assert.deepEqual(result,{lineAmounts:[
  {currency:"USD",netMinor:2000,taxMinor:200,grossMinor:2200},
  {currency:"USD",netMinor:1000,taxMinor:100,grossMinor:1100},
 ],subtotalMinor:3000,taxMinor:350,shippingFeeMinor:550,totalMinor:3850});
});
test("rejects totals and currencies outside the supported integer domain",()=>{
 assert.throws(()=>calculateStorefrontTotals([
  {unitPriceMinor:Number.MAX_SAFE_INTEGER,quantity:1,taxRateBps:0,taxMode:"exclusive"},
  {unitPriceMinor:1,quantity:1,taxRateBps:0,taxMode:"exclusive"},
 ],"USD"),RangeError);
 assert.throws(()=>calculateStorefrontTotals([{unitPriceMinor:100,quantity:1,taxRateBps:0,taxMode:"exclusive"}],"US"),RangeError);
});
test("policy version is stable for the same policy and changes when either policy changes",()=>{
 const version=storefrontPolicyVersion("Terms v1","Privacy v1");
 assert.equal(storefrontPolicyVersion("Terms v1","Privacy v1"),version);
 assert.notEqual(storefrontPolicyVersion("Terms v2","Privacy v1"),version);
 assert.notEqual(storefrontPolicyVersion("Terms v1","Privacy v2"),version);
});
