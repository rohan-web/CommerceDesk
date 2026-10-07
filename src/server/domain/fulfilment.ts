import { createHash } from "node:crypto";

export type FulfilmentOrderLine = { kind: "physical" | "service"; quantity: number };
export type FulfilmentEvent = { eventType?: "dispatch" | "service_completion"; lines: readonly { lineIndex: number; quantity: number }[] };
export type DispatchLine = { lineIndex: number; quantity: number };

function eventQuantities(events: readonly FulfilmentEvent[], lineCount: number, eventType: "dispatch" | "service_completion"): number[] {
  const totals = Array.from({ length: lineCount }, () => 0);
  for (const event of events) {
    if ((event.eventType ?? "dispatch") !== eventType) continue;
    for (const line of event.lines) {
    if (!Number.isInteger(line.lineIndex) || line.lineIndex < 0 || line.lineIndex >= lineCount || !Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new Error("INVALID_FULFILMENT_HISTORY");
    totals[line.lineIndex] += line.quantity;
    if (!Number.isSafeInteger(totals[line.lineIndex])) throw new Error("INVALID_FULFILMENT_HISTORY");
    }
  }
  return totals;
}

export const fulfilledQuantities = (events: readonly FulfilmentEvent[], lineCount: number) => eventQuantities(events, lineCount, "dispatch");
export const serviceCompletedQuantities = (events: readonly FulfilmentEvent[], lineCount: number) => eventQuantities(events, lineCount, "service_completion");

export function validateDispatch(orderLines: readonly FulfilmentOrderLine[], events: readonly FulfilmentEvent[], requested: readonly DispatchLine[]): { fulfilled: number[]; next: number[] } {
  if (!requested.length) throw new Error("DISPATCH_EMPTY");
  const fulfilled = fulfilledQuantities(events, orderLines.length), next = [...fulfilled], seen = new Set<number>();
  for (const line of requested) {
    if (!Number.isInteger(line.lineIndex) || line.lineIndex < 0 || line.lineIndex >= orderLines.length || !Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new Error("DISPATCH_INVALID_LINE");
    if (seen.has(line.lineIndex)) throw new Error("DISPATCH_DUPLICATE_LINE");
    seen.add(line.lineIndex);
    const orderLine = orderLines[line.lineIndex];
    if (orderLine.kind !== "physical") throw new Error("DISPATCH_SERVICE_LINE");
    if (!Number.isSafeInteger(orderLine.quantity) || orderLine.quantity < 1 || fulfilled[line.lineIndex] > orderLine.quantity) throw new Error("INVALID_FULFILMENT_HISTORY");
    next[line.lineIndex] += line.quantity;
    if (next[line.lineIndex] > orderLine.quantity) throw new Error("DISPATCH_EXCEEDS_REMAINING");
  }
  return { fulfilled, next };
}

export function dispatchFingerprint(lines: readonly DispatchLine[]): string {
  return createHash("sha256").update(JSON.stringify({eventType:"dispatch",lines:[...lines].sort((a,b)=>a.lineIndex-b.lineIndex)})).digest("hex");
}

export function validateServiceCompletion(orderLines: readonly FulfilmentOrderLine[], events: readonly FulfilmentEvent[], requested: readonly DispatchLine[]): { completed: number[]; next: number[] } {
  if (!requested.length) throw new Error("SERVICE_COMPLETION_EMPTY");
  const completed=serviceCompletedQuantities(events,orderLines.length),next=[...completed],seen=new Set<number>();
  for(const line of requested){
    if(!Number.isInteger(line.lineIndex)||line.lineIndex<0||line.lineIndex>=orderLines.length||!Number.isSafeInteger(line.quantity)||line.quantity<1)throw new Error("SERVICE_COMPLETION_INVALID_LINE");
    if(seen.has(line.lineIndex))throw new Error("DISPATCH_DUPLICATE_LINE");seen.add(line.lineIndex);
    const orderLine=orderLines[line.lineIndex];if(orderLine.kind!=="service")throw new Error("SERVICE_COMPLETION_PHYSICAL_LINE");
    if(!Number.isSafeInteger(orderLine.quantity)||orderLine.quantity<1||completed[line.lineIndex]>orderLine.quantity)throw new Error("INVALID_FULFILMENT_HISTORY");
    next[line.lineIndex]+=line.quantity;if(next[line.lineIndex]>orderLine.quantity)throw new Error("SERVICE_COMPLETION_EXCEEDS_REMAINING");
  }
  return {completed,next};
}

export function serviceCompletionFingerprint(lines:readonly DispatchLine[],note:string){
  return createHash("sha256").update(JSON.stringify({eventType:"service_completion",lines:[...lines].sort((a,b)=>a.lineIndex-b.lineIndex),note})).digest("hex");
}

export function fulfilmentStatus(orderLines: readonly FulfilmentOrderLine[], fulfilled: readonly number[], servicesCompleted:readonly number[]=[]): "unfulfilled" | "partially_fulfilled" | "fulfilled" {
  const completed=orderLines.map((line,index)=>line.kind==="physical"?(fulfilled[index]??0):(servicesCompleted[index]??0));
  if(!completed.some((quantity)=>quantity>0))return "unfulfilled";
  return orderLines.every((line,index)=>completed[index]>=line.quantity)?"fulfilled":"partially_fulfilled";
}
