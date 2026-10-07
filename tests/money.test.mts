import assert from "node:assert/strict";
import test from "node:test";
import { applyDiscountMinor, calculateDiscountedLineAmount, calculateLineAmount, formatMinorUnits } from "../src/server/domain/money.ts";

test("exclusive tax rounds once at the line level", () => {
  assert.deepEqual(calculateLineAmount({unitPriceMinor:1234,quantity:1,taxRateBps:825,taxMode:"exclusive"},"USD"), {
    currency:"USD",netMinor:1234,taxMinor:102,grossMinor:1336,
  });
});
test("inclusive tax splits the stored gross without repricing it", () => {
  assert.deepEqual(calculateLineAmount({unitPriceMinor:1336,quantity:1,taxRateBps:825,taxMode:"inclusive"},"USD"), {
    currency:"USD",netMinor:1234,taxMinor:102,grossMinor:1336,
  });
});
test("zero quantity creates a zero-valued line", () => {
  assert.deepEqual(calculateLineAmount({unitPriceMinor:900,quantity:0,taxRateBps:2000,taxMode:"exclusive"},"EUR"), {
    currency:"EUR",netMinor:0,taxMinor:0,grossMinor:0,
  });
});
test("rejects unsafe or negative money inputs", () => {
  assert.throws(() => calculateLineAmount({unitPriceMinor:Number.MAX_SAFE_INTEGER+1,quantity:1,taxRateBps:0,taxMode:"exclusive"},"USD"), RangeError);
  assert.throws(() => calculateLineAmount({unitPriceMinor:100,quantity:-1,taxRateBps:0,taxMode:"exclusive"},"USD"), RangeError);
});
test("formats currencies using their own minor-unit precision", () => {
  assert.equal(formatMinorUnits(1234,"USD","en-US"),"$12.34");
  assert.equal(formatMinorUnits(1234,"JPY","en-US"),"¥1,234");
  assert.match(formatMinorUnits(1234,"KWD","en-US"),/1\.234/);
});
test("percentage discounts recalculate taxable line totals with integer rounding", () => {
  assert.deepEqual(calculateDiscountedLineAmount({unitPriceMinor:1000,quantity:2,taxRateBps:1000,taxMode:"exclusive"},"USD",1000), {
    currency:"USD",netMinor:1800,taxMinor:180,grossMinor:1980,discountAmountMinor:220,
  });
  assert.deepEqual(calculateDiscountedLineAmount({unitPriceMinor:1100,quantity:1,taxRateBps:1000,taxMode:"inclusive"},"USD",1000), {
    currency:"USD",netMinor:900,taxMinor:90,grossMinor:990,discountAmountMinor:110,
  });
});
test("discount validation rejects unsafe values and preserves half-up minor-unit rounding", () => {
  assert.equal(applyDiscountMinor(1,5000),1);
  assert.equal(applyDiscountMinor(1,5001),0);
  assert.throws(() => applyDiscountMinor(Number.MAX_SAFE_INTEGER+1,1),RangeError);
  assert.throws(() => applyDiscountMinor(100,-1),RangeError);
  assert.throws(() => applyDiscountMinor(100,10000),RangeError);
});
