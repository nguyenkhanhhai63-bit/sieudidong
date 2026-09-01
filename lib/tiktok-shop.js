import crypto from "node:crypto";
import { redisCommand } from "./redis.js";

const API_BASE = "https://open-api.tiktokglobalshop.com";
const AUTH_BASE = "https://auth.tiktok-shops.com";
const CONN_PREFIX = "tiktokshop:connection:";
const DEFAULT_CONN_KEY = "tiktokshop:connection:default";

function text(v,max=8000){
  return String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);
}
function nowSec(){ return Math.floor(Date.now()/1000); }
function appKey(){ return text(process.env.TIKTOK_SHOP_APP_KEY||process.env.TIKTOK_APP_KEY,300); }
function appSecret(){ return text(process.env.TIKTOK_SHOP_APP_SECRET||process.env.TIKTOK_APP_SECRET,1000); }
function serviceId(){ return text(process.env.TIKTOK_SHOP_SERVICE_ID||process.env.TIKTOK_SERVICE_ID,300); }
function enabled(){ return !["0","false","off","no"].includes(text(process.env.TIKTOK_AI_ENABLED||"1",20).toLowerCase()); }

export function tiktokShopConfig(){
  return {appKey:appKey(),appSecret:appSecret(),serviceId:serviceId(),enabled:enabled()};
}

function safeJson(v,fallback={}){
  if(v && typeof v === "object") return v;
  try{return JSON.parse(String(v||""))}catch{return fallback}
}

function encodeQuery(obj){
  const qs = new URLSearchParams();
  for(const [k,v] of Object.entries(obj||{})) if(v!==undefined && v!==null && v!=="") qs.set(k,String(v));
  return qs;
}

export function generateTiktokShopSign(path, params, bodyString=""){
  const secret=appSecret();
  if(!secret) throw new Error("Thiếu TIKTOK_SHOP_APP_SECRET");
  const pairs=Object.entries(params||{})
    .filter(([k])=>k!=="sign"&&k!=="access_token")
    .sort(([a],[b])=>a.localeCompare(b));
  const paramString=pairs.map(([k,v])=>`${k}${v}`).join("");
  const input=`${secret}${path}${paramString}${bodyString||""}${secret}`;
  return crypto.createHmac("sha256",secret).update(input,"utf8").digest("hex");
}

export async function tiktokShopRequest({path,method="GET",accessToken,shopCipher,query={},body}){
  const key=appKey();
  if(!key) throw new Error("Thiếu TIKTOK_SHOP_APP_KEY");
  if(!accessToken) throw new Error("Thiếu TikTok Shop access token");
  const params={app_key:key,timestamp:nowSec(),...query};
  if(shopCipher) params.shop_cipher=shopCipher;
  const bodyString = body===undefined || body===null ? "" : JSON.stringify(body);
  params.sign=generateTiktokShopSign(path,params,bodyString);
  const url=`${API_BASE}${path}?${encodeQuery(params).toString()}`;
  const r=await fetch(url,{
    method,
    headers:{"content-type":"application/json","x-tts-access-token":accessToken},
    body: method==="GET" || method==="HEAD" ? undefined : bodyString
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok || Number(data?.code||0)!==0){
    const err=new Error(`TikTok Shop API ${r.status}: ${text(data?.message||data?.error||JSON.stringify(data),1000)}`);
    err.status=r.status; err.data=data;
    throw err;
  }
  return data;
}

export async function exchangeTikTokShopCode(authCode){
  const key=appKey(), secret=appSecret();
  if(!key||!secret) throw new Error("Thiếu TIKTOK_SHOP_APP_KEY hoặc TIKTOK_SHOP_APP_SECRET");
  const qs=encodeQuery({app_key:key,app_secret:secret,auth_code:authCode,grant_type:"authorized_code"});
  const r=await fetch(`${AUTH_BASE}/api/v2/token/get?${qs.toString()}`);
  const data=await r.json().catch(()=>({}));
  if(!r.ok || Number(data?.code||0)!==0) throw new Error(`Không lấy được TikTok access token: ${text(data?.message||JSON.stringify(data),800)}`);
  return data?.data||data;
}

export async function refreshTikTokShopToken(refreshToken){
  const key=appKey(), secret=appSecret();
  if(!key||!secret||!refreshToken) throw new Error("Thiếu thông tin refresh token TikTok Shop");
  const qs=encodeQuery({app_key:key,app_secret:secret,refresh_token:refreshToken,grant_type:"refresh_token"});
  const r=await fetch(`${AUTH_BASE}/api/v2/token/refresh?${qs.toString()}`);
  const data=await r.json().catch(()=>({}));
  if(!r.ok || Number(data?.code||0)!==0) throw new Error(`Không refresh được TikTok token: ${text(data?.message||JSON.stringify(data),800)}`);
  return data?.data||data;
}

export async function getAuthorizedShops(accessToken){
  const data=await tiktokShopRequest({path:"/authorization/202309/shops",accessToken});
  return Array.isArray(data?.data?.shops)?data.data.shops:[];
}

function expiryEpoch(tokenData){
  const raw=Number(tokenData?.access_token_expire_in||tokenData?.access_token_expire_time||tokenData?.access_token_expires_in||0);
  if(!raw) return 0;
  return raw>2_000_000_000 ? raw : nowSec()+raw;
}

export async function saveTikTokShopConnection(tokenData,shop){
  const conn={
    accessToken:text(tokenData?.access_token,6000),
    refreshToken:text(tokenData?.refresh_token,6000),
    accessTokenExpiresAt:expiryEpoch(tokenData),
    refreshTokenExpiresIn:Number(tokenData?.refresh_token_expire_in||tokenData?.refresh_token_expires_in||0),
    openId:text(tokenData?.open_id,500),
    userType:Number(tokenData?.user_type||0),
    grantedScopes:Array.isArray(tokenData?.granted_scopes)?tokenData.granted_scopes:(Array.isArray(tokenData?.granted_permissions)?tokenData.granted_permissions:[]),
    shopId:text(shop?.id||shop?.shop_id,500),
    shopCipher:text(shop?.cipher||shop?.shop_cipher,1000),
    shopName:text(shop?.name||shop?.shop_name,500),
    region:text(shop?.region||shop?.region_code,100),
    updatedAt:Date.now()
  };
  if(!conn.accessToken) throw new Error("TikTok không trả về access token");
  if(!conn.shopCipher) throw new Error("Không lấy được shop_cipher từ TikTok Shop");
  await redisCommand(["SET",DEFAULT_CONN_KEY,JSON.stringify(conn)]);
  if(conn.shopId) await redisCommand(["SET",`${CONN_PREFIX}${conn.shopId}`,JSON.stringify(conn)]);
  return conn;
}

async function loadRawConnection(shopId=""){
  let raw="";
  if(shopId) raw=await redisCommand(["GET",`${CONN_PREFIX}${shopId}`]);
  if(!raw) raw=await redisCommand(["GET",DEFAULT_CONN_KEY]);
  return safeJson(raw,null);
}

export async function loadTikTokShopConnection(shopId=""){
  let conn=await loadRawConnection(shopId);
  if(!conn) return null;
  if(conn.accessTokenExpiresAt && Number(conn.accessTokenExpiresAt) < nowSec()+600 && conn.refreshToken){
    try{
      const fresh=await refreshTikTokShopToken(conn.refreshToken);
      const merged={...fresh, refresh_token:fresh.refresh_token||conn.refreshToken};
      const shop={id:conn.shopId,cipher:conn.shopCipher,name:conn.shopName,region:conn.region};
      conn=await saveTikTokShopConnection(merged,shop);
    }catch(e){ console.error("TikTok token refresh:",e?.message||e); }
  }
  return conn;
}

export async function configureNewMessageWebhook(conn,address){
  return tiktokShopRequest({
    path:"/event/202309/webhooks",
    method:"PUT",
    accessToken:conn.accessToken,
    shopCipher:conn.shopCipher,
    body:{address,event_type:"NEW_MESSAGE"}
  });
}

export async function sendTikTokShopText(conn,conversationId,message){
  const content=JSON.stringify({content:text(message,6000)});
  return tiktokShopRequest({
    path:`/customer_service/202309/conversations/${encodeURIComponent(conversationId)}/messages`,
    method:"POST",
    accessToken:conn.accessToken,
    shopCipher:conn.shopCipher,
    body:{type:"TEXT",content}
  });
}

export function verifyTikTokShopWebhook(rawBody,authorization){
  const key=appKey(), secret=appSecret();
  if(!key||!secret||!authorization) return false;
  const expected=crypto.createHmac("sha256",secret).update(key+rawBody,"utf8").digest("hex");
  const got=text(authorization,500).toLowerCase();
  try{
    const a=Buffer.from(expected,"utf8"), b=Buffer.from(got,"utf8");
    return a.length===b.length && crypto.timingSafeEqual(a,b);
  }catch{return false;}
}

export function makeTikTokAuthState(){
  const secret=appSecret();
  const nonce=crypto.randomBytes(12).toString("hex");
  const ts=nowSec();
  const payload=`${ts}.${nonce}`;
  const sig=crypto.createHmac("sha256",secret).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`,"utf8").toString("base64url");
}
export function verifyTikTokAuthState(state){
  try{
    const decoded=Buffer.from(String(state||""),"base64url").toString("utf8");
    const [ts,nonce,sig]=decoded.split(".");
    if(!ts||!nonce||!sig||Math.abs(nowSec()-Number(ts))>1800) return false;
    const payload=`${ts}.${nonce}`;
    const exp=crypto.createHmac("sha256",appSecret()).update(payload).digest("hex");
    const a=Buffer.from(exp),b=Buffer.from(sig);
    return a.length===b.length&&crypto.timingSafeEqual(a,b);
  }catch{return false;}
}

export function tiktokSellerAuthorizeUrl(state){
  const sid=serviceId();
  if(!sid) throw new Error("Thiếu TIKTOK_SHOP_SERVICE_ID");
  const region=text(process.env.TIKTOK_SHOP_AUTH_REGION||"ROW",20).toUpperCase();
  const base=region==="US"?"https://services.us.tiktokshop.com/open/authorize":"https://services.tiktokshop.com/open/authorize";
  return `${base}?${encodeQuery({service_id:sid,state}).toString()}`;
}
