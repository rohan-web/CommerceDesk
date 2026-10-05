import test from "node:test";
import assert from "node:assert/strict";
import {boundsForLocalDate,hasIntervalCapacity,isWithinAppointmentChangeWindow,slotsForLocalDate} from "../src/server/domain/appointments.ts";

test("spring-forward day omits local times that never occur",()=>{
 const slots=slotsForLocalDate({date:"2026-03-08",timeZone:"America/New_York",openMinute:60,closeMinute:240,durationMinutes:30,stepMinutes:30});
 assert.deepEqual(slots.map(slot=>slot.label),["1:00 AM","1:30 AM","3:00 AM","3:30 AM"]);
 assert.ok(slots.every(slot=>slot.startsAt.toISOString().endsWith("Z")));
});

test("fall-back day retains both real instants for repeated local times",()=>{
 const slots=slotsForLocalDate({date:"2026-11-01",timeZone:"America/New_York",openMinute:60,closeMinute:120,durationMinutes:30,stepMinutes:30});
 assert.equal(slots.length,4);
 assert.deepEqual(slots.map(slot=>slot.label),["1:00 AM","1:30 AM","1:00 AM","1:30 AM"]);
 assert.equal(new Set(slots.map(slot=>slot.startsAt.getTime())).size,4);
 assert.equal(new Set(slots.map(slot=>slot.offsetLabel)).size,2);
});

test("a booking is rejected when active intervals exceed resource capacity",()=>{
 const candidate={startAt:new Date("2026-09-30T10:00:00Z"),endAt:new Date("2026-09-30T11:00:00Z")};
 const first={startAt:new Date("2026-09-30T10:00:00Z"),endAt:new Date("2026-09-30T10:45:00Z")};
 const second={startAt:new Date("2026-09-30T10:30:00Z"),endAt:new Date("2026-09-30T11:15:00Z")};
 assert.equal(hasIntervalCapacity(candidate,[first],2),true);
 assert.equal(hasIntervalCapacity(candidate,[first,second],2),false);
 assert.equal(hasIntervalCapacity(candidate,[{startAt:new Date("2026-09-30T09:00:00Z"),endAt:candidate.startAt}],1),true);
});

test("invalid dates and business windows fail closed",()=>{
 assert.throws(()=>slotsForLocalDate({date:"2026-02-30",timeZone:"UTC",openMinute:540,closeMinute:1020,durationMinutes:30}));
 assert.throws(()=>slotsForLocalDate({date:"2026-09-30",timeZone:"Not/AZone",openMinute:540,closeMinute:1020,durationMinutes:30}));
 assert.throws(()=>slotsForLocalDate({date:"2026-09-30",timeZone:"UTC",openMinute:1020,closeMinute:540,durationMinutes:30}));
});

test("all-day closure bounds preserve 23- and 25-hour local DST dates",()=>{
 const spring=boundsForLocalDate("2026-03-08","America/New_York");
 const autumn=boundsForLocalDate("2026-11-01","America/New_York");
 assert.equal(spring.endsAt.getTime()-spring.startsAt.getTime(),23*60*60_000);
 assert.equal(autumn.endsAt.getTime()-autumn.startsAt.getTime(),25*60*60_000);
});

test("all-day closure bounds reject skipped local calendar dates",()=>{
 assert.throws(()=>boundsForLocalDate("2011-12-30","Pacific/Apia"),RangeError);
});

test("customer appointment changes close at the exact configured policy boundary",()=>{
 const startsAt=new Date("2026-10-30T18:00:00.000Z"),cutoff=new Date("2026-10-29T18:00:00.000Z");
 assert.equal(isWithinAppointmentChangeWindow(startsAt,24,new Date(cutoff.getTime()-1)),true);
 assert.equal(isWithinAppointmentChangeWindow(startsAt,24,cutoff),false);
 assert.equal(isWithinAppointmentChangeWindow(startsAt,0,new Date("2026-10-30T17:59:59.999Z")),true);
 assert.throws(()=>isWithinAppointmentChangeWindow(startsAt,-1,cutoff),RangeError);
});
