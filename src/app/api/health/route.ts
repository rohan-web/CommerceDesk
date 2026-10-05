import {NextResponse} from "next/server";
import {connectDatabase} from "@/server/db";
import {getRedis} from "@/server/rate-limit";
export const dynamic="force-dynamic";
export async function GET(){
 const checks={database:"unavailable",redis:"unavailable",worker:"unavailable",providers:"not_implemented"};
 try{const db=await connectDatabase();await db.connection.db?.admin().ping();checks.database="ready"}catch{}
 try{const redis=getRedis();await redis.ping();checks.redis="ready";const heartbeat=await redis.get("commercedesk:worker:heartbeat");if(heartbeat&&Date.now()-Number(heartbeat)<45_000)checks.worker="ready"}catch{}
 const ready=checks.database==="ready"&&checks.redis==="ready"&&checks.worker==="ready";
 return NextResponse.json({status:ready?"ready":"degraded",checks},{status:ready?200:503,headers:{"Cache-Control":"no-store"}});
}
