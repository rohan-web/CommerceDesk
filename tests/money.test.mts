import assert from "node:assert/strict";
import test from "node:test";
import { calculateLineAmount, formatMinorUnits } from "../src/server/domain/money.ts";

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
