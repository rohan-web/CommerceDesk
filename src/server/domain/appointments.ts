export type MinuteInterval={startAt:Date;endAt:Date};
export type LocalSlot={startsAt:Date;bufferedStartsAt:Date;endsAt:Date;bufferedEndsAt:Date;label:string;offsetLabel:string};
const minuteMs=60_000;
const localFormatterCache=new Map<string,Intl.DateTimeFormat>();
function localFormatter(timeZone:string){let formatter=localFormatterCache.get(timeZone);if(!formatter){formatter=new Intl.DateTimeFormat("en-GB",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",timeZoneName:"short"});localFormatterCache.set(timeZone,formatter)}return formatter}

function localParts(date:Date,timeZone:string){
 const parts=localFormatter(timeZone).formatToParts(date);
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return{date:`${values.year}-${values.month}-${values.day}`,minute:Number(values.hour)*60+Number(values.minute),second:Number(values.second),timeZoneName:values.timeZoneName||""};
}

export function localDateInZone(date:Date,timeZone:string){
 if(!Number.isFinite(date.getTime()))throw new RangeError("A valid instant is required.");
 const values=Object.fromEntries(localFormatter(timeZone).formatToParts(date).map(part=>[part.type,part.value]));
 return `${values.year}-${values.month}-${values.day}`;
}

/** Resolves an all-day local calendar date to its actual instant bounds, including 23/25-hour DST days. */
export function boundsForLocalDate(date:string,timeZone:string){
 if(!isValidLocalDate(date))throw new RangeError("A valid local date is required.");
 new Intl.DateTimeFormat("en",{timeZone});
 const nominal=Date.parse(`${date}T00:00:00.000Z`),from=nominal-36*60*minuteMs,to=nominal+60*60*minuteMs;
 let startsAt:number|undefined,endsAt:number|undefined;
 for(let instant=from;instant<=to;instant+=minuteMs){
  const localDate=localDateInZone(new Date(instant),timeZone);
  if(!startsAt&&localDate===date)startsAt=instant;
  else if(startsAt&&localDate!==date){endsAt=instant;break}
 }
 if(startsAt===undefined||endsAt===undefined)throw new RangeError("This local calendar date does not exist in the selected timezone.");
 return{startsAt:new Date(startsAt),endsAt:new Date(endsAt)};
}

export function isWithinAppointmentChangeWindow(startsAt:Date,cancellationPolicyHours:number,now:Date=new Date()){
 if(!Number.isFinite(startsAt.getTime())||!Number.isInteger(cancellationPolicyHours)||cancellationPolicyHours<0||cancellationPolicyHours>8760||!Number.isFinite(now.getTime()))throw new RangeError("A valid appointment time, change window and current instant are required.");
 return now.getTime()<startsAt.getTime()-cancellationPolicyHours*60*minuteMs;
}

export function isValidLocalDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const parsed=new Date(`${value}T12:00:00.000Z`);
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}

function staysInsideHours(start:number,end:number,date:string,timeZone:string,openMinute:number,closeMinute:number){
 for(let instant=start;instant<end;instant+=minuteMs){
  const part=localParts(new Date(instant),timeZone);
  if(part.date!==date||part.minute<openMinute||part.minute>=closeMinute)return false;
 }
 return true;
}

/** Enumerates real instants for a local business date, preserving both fall-back times and skipping spring-forward gaps. */
export function slotsForLocalDate(input:{date:string;timeZone:string;openMinute:number;closeMinute:number;durationMinutes:number;bufferBeforeMinutes?:number;bufferAfterMinutes?:number;stepMinutes?:number}):LocalSlot[]{
 const{date,timeZone,openMinute,closeMinute,durationMinutes,bufferBeforeMinutes=0,bufferAfterMinutes=0,stepMinutes=15}=input;
 if(!isValidLocalDate(date)||!Number.isInteger(openMinute)||!Number.isInteger(closeMinute)||openMinute<0||closeMinute>1440||openMinute>=closeMinute)throw new RangeError("A valid local date and business-hours window are required.");
 if(!Number.isInteger(durationMinutes)||durationMinutes<1||!Number.isInteger(bufferBeforeMinutes)||bufferBeforeMinutes<0||!Number.isInteger(bufferAfterMinutes)||bufferAfterMinutes<0||!Number.isInteger(stepMinutes)||stepMinutes<1)throw new RangeError("Appointment duration, buffers and slot step must be whole minutes.");
 new Intl.DateTimeFormat("en",{timeZone});
 const openAt=openMinute+bufferBeforeMinutes,lastStart=closeMinute-durationMinutes-bufferAfterMinutes;
 if(openAt>lastStart)return[];
 const wallStart=Date.parse(`${date}T00:00:00.000Z`),from=wallStart-14*60*minuteMs,to=wallStart+38*60*minuteMs;
 const slots:LocalSlot[]=[];
 for(let instant=from;instant<=to;instant+=minuteMs){
  const part=localParts(new Date(instant),timeZone);
  if(part.date!==date||part.second!==0||part.minute<openAt||part.minute>lastStart||(part.minute-openAt)%stepMinutes!==0)continue;
  const bufferedStart=instant-bufferBeforeMinutes*minuteMs,appointmentEnd=instant+durationMinutes*minuteMs,bufferedEnd=appointmentEnd+bufferAfterMinutes*minuteMs;
  if(!staysInsideHours(bufferedStart,bufferedEnd,date,timeZone,openMinute,closeMinute))continue;
  const label=new Intl.DateTimeFormat("en-US",{timeZone,hour:"numeric",minute:"2-digit",hourCycle:"h12"}).format(new Date(instant));
  const offsetLabel=new Intl.DateTimeFormat("en-US",{timeZone,timeZoneName:"short"}).formatToParts(new Date(instant)).find(value=>value.type==="timeZoneName")?.value||part.timeZoneName;
  slots.push({startsAt:new Date(instant),bufferedStartsAt:new Date(bufferedStart),endsAt:new Date(appointmentEnd),bufferedEndsAt:new Date(bufferedEnd),label,offsetLabel});
 }
 return slots;
}

/** Checks interval capacity with half-open intervals, so a booking ending at another's start does not overlap. */
export function hasIntervalCapacity(candidate:MinuteInterval,existing:MinuteInterval[],capacity:number){
 if(!Number.isInteger(capacity)||capacity<1)throw new RangeError("Resource capacity must be a positive integer.");
 const start=candidate.startAt.getTime(),end=candidate.endAt.getTime();
 if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)return false;
 const events:{at:number;delta:1|-1}[]=[{at:start,delta:1},{at:end,delta:-1}];
 for(const interval of existing){
  const intervalStart=Math.max(start,interval.startAt.getTime()),intervalEnd=Math.min(end,interval.endAt.getTime());
  if(intervalStart<intervalEnd){events.push({at:intervalStart,delta:1},{at:intervalEnd,delta:-1})}
 }
 events.sort((a,b)=>a.at-b.at||a.delta-b.delta);
 let active=0;
 for(const event of events){active+=event.delta;if(active>capacity)return false}
 return true;
}
