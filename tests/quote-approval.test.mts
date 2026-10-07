import assert from "node:assert/strict";
import test from "node:test";
import {quoteDiscountRequiresApproval} from "../src/server/domain/quote-approval.ts";

test("quote discounts at or below a tenant threshold issue without escalation",()=>{
 assert.equal(quoteDiscountRequiresApproval(0,0),false);
 assert.equal(quoteDiscountRequiresApproval(100,100),false);
 assert.equal(quoteDiscountRequiresApproval(99,100),false);
});
test("quote discounts above the tenant threshold need approval",()=>{
 assert.equal(quoteDiscountRequiresApproval(101,100),true);
 assert.equal(quoteDiscountRequiresApproval(1,0),true);
});
test("quote approval thresholds reject out-of-domain values",()=>{
 assert.throws(()=>quoteDiscountRequiresApproval(-1,0),RangeError);
 assert.throws(()=>quoteDiscountRequiresApproval(0,10000),RangeError);
 assert.throws(()=>quoteDiscountRequiresApproval(1.5,0),RangeError);
});
