export function emailRetryDelayMs(attempt:number){return Math.min(15*60_000,30_000*2**Math.max(0,attempt-1))}
