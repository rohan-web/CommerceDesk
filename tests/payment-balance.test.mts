import test from "node:test";
import assert from "node:assert/strict";
import {paymentStatusFromLedger,remainingRefundableMinor} from "../src/server/domain/payment-balance.ts";

test("refund availability subtracts recorded and in-flight refunds",()=>{
 assert.equal(remainingRefundableMinor(12000,2500,1000),8500);
 assert.equal(remainingRefundableMinor(12000,12000),0);
});
test("refund availability rejects invalid or over-reserved totals",()=>{
 assert.throws(()=>remainingRefundableMinor(1000,400,700),/exceed captured funds/);
 assert.throws(()=>remainingRefundableMinor(Number.MAX_SAFE_INTEGER+1,0),/safe integers/);
 assert.throws(()=>remainingRefundableMinor(100,-1),/non-negative/);
});
test("payment status changes only from captured and refunded ledger totals",()=>{
 assert.equal(paymentStatusFromLedger(0,0,9000),"unpaid");
 assert.equal(paymentStatusFromLedger(4000,0,9000),"partially_paid");
 assert.equal(paymentStatusFromLedger(9000,0,9000),"paid");
 assert.equal(paymentStatusFromLedger(9000,2000,9000),"partially_refunded");
 assert.equal(paymentStatusFromLedger(9000,9000,9000),"refunded");
 assert.throws(()=>paymentStatusFromLedger(1000,1001,1000),/refunds cannot exceed/);
});
