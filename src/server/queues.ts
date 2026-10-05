import {Queue} from "bullmq";
import {getRedis} from "./rate-limit";
type QueueCache=typeof globalThis&{__commerceEventQueue?:Queue};
export function commerceEventQueue(){const root=globalThis as QueueCache;return root.__commerceEventQueue??=new Queue("commercedesk-events",{connection:getRedis()})}
