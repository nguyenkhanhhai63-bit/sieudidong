import { redisCommand } from "./redis.js";
const KEY="ai:diagnostics:v1";
const clean=(v,n=500)=>String(v??"").replace(/[\u0000-\u001f]/g," ").slice(0,n);
export async function writeAiDiagnostic(data){
  try{
    const row={at:Date.now(),event:clean(data.event,24),provider:clean(data.provider,70),status:clean(data.status,30),durationMs:Math.max(0,Number(data.durationMs)||0),question:clean(data.question,800),answer:clean(data.answer,1000),sessionId:clean(data.sessionId,90),detail:clean(data.detail,450),intent:clean(data.intent,100)};
    await redisCommand(["LPUSH",KEY,JSON.stringify(row)]);
    await redisCommand(["LTRIM",KEY,"0","999"]);
    await redisCommand(["EXPIRE",KEY,String(30*24*3600)]);
  }catch(err){console.error("AI diagnostics save failed:",err?.message||err)}
}
export const AI_DIAGNOSTICS_KEY=KEY;
