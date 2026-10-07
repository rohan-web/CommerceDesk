import assert from "node:assert/strict";
import test from "node:test";
import { dispatchFingerprint, fulfilmentStatus, serviceCompletionFingerprint, validateDispatch, validateServiceCompletion } from "../src/server/domain/fulfilment.ts";

const lines = [{ kind: "physical" as const, quantity: 3 }, { kind: "physical" as const, quantity: 2 }];

test("dispatch accepts a valid partial shipment and reports cumulative quantities", () => {
  const first = validateDispatch(lines, [], [{ lineIndex: 0, quantity: 1 }]);
  assert.deepEqual(first.fulfilled, [0, 0]);
  assert.deepEqual(first.next, [1, 0]);
  assert.equal(fulfilmentStatus(lines, first.next), "partially_fulfilled");
});

test("dispatch rejects duplicate, invalid, service, and over-shipped quantities", () => {
  assert.throws(() => validateDispatch(lines, [], []), { message: "DISPATCH_EMPTY" });
  assert.throws(() => validateDispatch(lines, [], [{ lineIndex: 0, quantity: 1 }, { lineIndex: 0, quantity: 1 }]), { message: "DISPATCH_DUPLICATE_LINE" });
  assert.throws(() => validateDispatch(lines, [], [{ lineIndex: 2, quantity: 1 }]), { message: "DISPATCH_INVALID_LINE" });
  assert.throws(() => validateDispatch([{ kind: "service", quantity: 1 }], [], [{ lineIndex: 0, quantity: 1 }]), { message: "DISPATCH_SERVICE_LINE" });
  assert.throws(() => validateDispatch(lines, [{ lines: [{ lineIndex: 0, quantity: 2 }] }], [{ lineIndex: 0, quantity: 2 }]), { message: "DISPATCH_EXCEEDS_REMAINING" });
});

test("all physical order lines must be dispatched before the order is fully fulfilled", () => {
  assert.equal(fulfilmentStatus(lines, [3, 2]), "fulfilled");
  assert.equal(fulfilmentStatus([...lines, { kind: "service", quantity: 1 }], [3, 2, 0]), "partially_fulfilled");
  assert.equal(fulfilmentStatus([{ kind: "service", quantity: 1 }], [0]), "unfulfilled");
});

test("dispatch fingerprints are stable regardless of line order", () => {
  assert.equal(dispatchFingerprint([{ lineIndex: 1, quantity: 2 }, { lineIndex: 0, quantity: 1 }]), dispatchFingerprint([{ lineIndex: 0, quantity: 1 }, { lineIndex: 1, quantity: 2 }]));
});

test("service completion is separate from dispatch and completes a mixed order only when both are done",()=>{
 const mixed=[{kind:"physical" as const,quantity:2},{kind:"service" as const,quantity:3}],dispatched=[{eventType:"dispatch" as const,lines:[{lineIndex:0,quantity:2}]}];
 const first=validateServiceCompletion(mixed,dispatched,[{lineIndex:1,quantity:1}]);
 assert.deepEqual(first.completed,[0,0]);assert.deepEqual(first.next,[0,1]);
 assert.equal(fulfilmentStatus(mixed,[2,0],first.next),"partially_fulfilled");
 assert.equal(fulfilmentStatus(mixed,[2,0],[0,3]),"fulfilled");
});

test("service completion rejects physical lines, empty tasks, duplicates and quantity overflow",()=>{
 const mixed=[{kind:"physical" as const,quantity:2},{kind:"service" as const,quantity:3}];
 assert.throws(()=>validateServiceCompletion(mixed,[],[]),{message:"SERVICE_COMPLETION_EMPTY"});
 assert.throws(()=>validateServiceCompletion(mixed,[],[{lineIndex:0,quantity:1}]),{message:"SERVICE_COMPLETION_PHYSICAL_LINE"});
 assert.throws(()=>validateServiceCompletion(mixed,[],[{lineIndex:1,quantity:1},{lineIndex:1,quantity:1}]),{message:"DISPATCH_DUPLICATE_LINE"});
 assert.throws(()=>validateServiceCompletion(mixed,[{eventType:"service_completion",lines:[{lineIndex:1,quantity:2}]}],[{lineIndex:1,quantity:2}]),{message:"SERVICE_COMPLETION_EXCEEDS_REMAINING"});
});

test("service completion fingerprints include the note and sort lines",()=>{
 const lines=[{lineIndex:1,quantity:2},{lineIndex:0,quantity:1}];
 assert.equal(serviceCompletionFingerprint(lines,"done"),serviceCompletionFingerprint([...lines].reverse(),"done"));
 assert.notEqual(serviceCompletionFingerprint(lines,"done"),serviceCompletionFingerprint(lines,"needs follow-up"));
});
