import assert from "node:assert/strict";
import test from "node:test";
import { makeCsv, parseCsv } from "../src/server/domain/catalogue-csv.ts";

test("catalogue CSV parser supports quoted commas, newlines, and escaped quotes", () => {
  const result = parseCsv('name,description\r\nWidget,"A, useful\nthing with ""quotes"""\r\n');
  assert.equal(result.error, undefined);
  assert.deepEqual(result.records[0], { row: 2, values: { name: "Widget", description: 'A, useful\nthing with "quotes"' } });
});

test("catalogue CSV parser reports malformed quotes and inconsistent rows", () => {
  assert.match(parseCsv('name,sku\nItem,"unfinished').error!, /quoted field/);
  assert.match(parseCsv('name,sku\n"Item"tail,ABC').error!, /after a closing/);
  assert.match(parseCsv("name,sku\nItem").error!, /expected 2/);
});

test("CSV serializer quotes cells and neutralizes spreadsheet formulas", () => {
  assert.equal(makeCsv(["name", "price"], [["=1+1", 200], ["A, B", 500]]), '"name","price"\r\n"\'=1+1","200"\r\n"A, B","500"\r\n');
});
