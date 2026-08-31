import { redisCommand } from "./redis.js";

export const USED_SHEET_ID="1XXVLikPffW1E_Wd6Rbg5qZCeL3neBEXXQqZg4vK6Sjw";
export const USED_SHEET_GID="1593814067";
export const DEFAULT_USED_SHEET_URL=`https://docs.google.com/spreadsheets/d/${USED_SHEET_ID}/edit?gid=${USED_SHEET_GID}#gid=${USED_SHEET_GID}`;
const SETTINGS_KEY="used:sheet:settings:v1";
const CACHE_KEY="used:sheet:cache:v3";
const CACHE_SECONDS=120;

function txt(v,max=500){return String(v??"").replace(/[<>]/g,"").trim().slice(0,max)}
function digits(v){
  const raw=String(v??"").trim();
  if(!raw) return 0;
  const negative=/^-/.test(raw);
  const onlyDigits=raw.replace(/\D/g,"");
  if(!onlyDigits) return 0;
  const n=Number(onlyDigits);
  return Number.isFinite(n)?Math.round(negative?-n:n):0;
}
function norm(v){return txt(v,300).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/\s+/g," ")}
function parseCsv(csv=""){
  const rows=[];let row=[],cell="",quoted=false;
  for(let i=0;i<csv.length;i++){
    const c=csv[i];
    if(quoted){
      if(c==='"' && csv[i+1]==='"'){cell+='"';i++;}
      else if(c==='"') quoted=false;
      else cell+=c;
    }else{
      if(c==='"') quoted=true;
      else if(c===','){row.push(cell);cell="";}
      else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell="";}
      else if(c!=='\r') cell+=c;
    }
  }
  if(cell.length||row.length){row.push(cell);rows.push(row)}
  return rows;
}
function statusOf(v){
  const s=norm(v);
  if(s.includes("da ban")||s.includes("sold")) return "sold";
  return "available";
}
function idPart(v){return txt(v,100).replace(/[^a-zA-Z0-9_-]+/g,"_").replace(/^_+|_+$/g,"")}
function rowToItem(r,index){
  const stt=txt(r[0],30),name=txt(r[1],140),brand=txt(r[2],60),condition=txt(r[3],100),memory=txt(r[4],60),imei=txt(r[5],80);
  if(!name) return null;
  const costPrice=digits(r[6]),price=digits(r[7]),profit=digits(r[8]),accessories=txt(r[9],240),dateIn=txt(r[10],40),dateSold=txt(r[11],40),warranty=txt(r[12],140),status=statusOf(r[13]);
  return {
    id:`sheet_${idPart(imei||stt||String(index+1))}_${index+1}`,
    source:"sheet",sheetRow:index+2,stt,name,brand,condition,memory,imei,
    costPrice,price,profit,accessories,dateIn,dateSold,warranty,status,
    color:"",battery:"",note:"",imageAssets:[],images:[],updatedAt:new Date().toISOString()
  };
}

function parseSheetUrl(input){
  let raw=String(input||"").trim();
  if(!raw) throw new Error("Vui lòng nhập link Google Sheet");
  if(!/^https?:\/\//i.test(raw)) raw="https://"+raw;
  let u;
  try{u=new URL(raw)}catch(_){throw new Error("Link Google Sheet không hợp lệ")}
  if(!/(^|\.)docs\.google\.com$/i.test(u.hostname)) throw new Error("Link phải là Google Sheets trên docs.google.com");
  const m=u.pathname.match(/\/spreadsheets\/d\/([^/]+)/i);
  if(!m?.[1]) throw new Error("Không tìm thấy mã Google Sheet trong link");
  const id=m[1];
  let gid=u.searchParams.get("gid")||"";
  if(!gid && u.hash){const hm=u.hash.match(/(?:^#|[?&])gid=(\d+)/i);if(hm)gid=hm[1]}
  if(!gid) gid="0";
  if(!/^\d+$/.test(gid)) throw new Error("GID của trang tính không hợp lệ");
  const url=`https://docs.google.com/spreadsheets/d/${id}/edit?gid=${gid}#gid=${gid}`;
  return {id,gid,url};
}

export async function getUsedSheetConfig(){
  try{
    const raw=await redisCommand(["GET",SETTINGS_KEY]);
    if(raw){
      const d=JSON.parse(raw);
      if(d?.id && d?.gid!=null){
        return {id:String(d.id),gid:String(d.gid),url:String(d.url||`https://docs.google.com/spreadsheets/d/${d.id}/edit?gid=${d.gid}#gid=${d.gid}`),custom:true,updatedAt:d.updatedAt||""};
      }
    }
  }catch(_){}
  return {id:USED_SHEET_ID,gid:USED_SHEET_GID,url:DEFAULT_USED_SHEET_URL,custom:false,updatedAt:""};
}

export async function saveUsedSheetConfig(url){
  const cfg=parseSheetUrl(url);
  const data={...cfg,updatedAt:new Date().toISOString()};
  await redisCommand(["SET",SETTINGS_KEY,JSON.stringify(data)]);
  await redisCommand(["DEL",CACHE_KEY]);
  return {...data,custom:true};
}

async function readCache(){
  try{const raw=await redisCommand(["GET",CACHE_KEY]);const d=raw?JSON.parse(raw):null;return d&&Array.isArray(d.items)?d:null}catch(_){return null}
}
async function writeCache(data){
  try{await redisCommand(["SET",CACHE_KEY,JSON.stringify(data),"EX",String(CACHE_SECONDS)])}catch(_){}
}
export async function fetchUsedSheet({force=false}={}){
  const cfg=await getUsedSheetConfig();
  if(!force){
    const c=await readCache();
    if(c && String(c.sheetId)===cfg.id && String(c.gid)===cfg.gid)return {...c,cached:true};
  }
  const url=`https://docs.google.com/spreadsheets/d/${cfg.id}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(cfg.gid)}&t=${Date.now()}`;
  try{
    const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 SieuDiDong/1.0"}});
    if(!r.ok) throw new Error(`Google Sheet trả HTTP ${r.status}`);
    const csv=await r.text();
    if(!csv || /<!doctype html|<html/i.test(csv)) throw new Error("Google Sheet chưa cho phép đọc dữ liệu");
    const table=parseCsv(csv);
    if(table.length<2) throw new Error("Google Sheet chưa có dữ liệu");
    const header=(table[0]||[]).map(norm).join("|");
    if(!header.includes("ten may") || !header.includes("gia ban")) throw new Error("Không nhận đúng bảng máy cũ");
    const items=table.slice(1).map(rowToItem).filter(Boolean).slice(0,1000);
    const data={ok:true,items,fetchedAt:new Date().toISOString(),sheetId:cfg.id,gid:cfg.gid,sheetUrl:cfg.url};
    await writeCache(data);
    return {...data,cached:false};
  }catch(error){
    const c=await readCache();
    if(c && String(c.sheetId)===cfg.id && String(c.gid)===cfg.gid)return {...c,cached:true,warning:error?.message||"Không tải được Google Sheet"};
    throw error;
  }
}

function imageList(x={}){
  if(Array.isArray(x.imageAssets)&&x.imageAssets.length) return x.imageAssets.map(a=>String(a?.url||"").trim()).filter(Boolean).slice(0,8);
  return Array.isArray(x.images)?x.images.map(String).filter(Boolean).slice(0,8):[];
}
function keyOf(x={}){
  const imei=norm(x.imei); if(imei) return `i:${imei}`;
  return `n:${norm(x.name)}|${norm(x.memory)}`;
}
export function mergeSheetWithOverlays(sheetItems=[],overlays=[]){
  const map=new Map();
  for(const x of Array.isArray(overlays)?overlays:[]){
    const k=keyOf(x); if(k&&!map.has(k))map.set(k,x);
  }
  return (Array.isArray(sheetItems)?sheetItems:[]).map(s=>{
    const o=map.get(keyOf(s))||{};
    const imageAssets=Array.isArray(o.imageAssets)?o.imageAssets:[];
    const images=imageList(o);
    return {...s,
      id:String(o.id||s.id),
      color:txt(o.color,60),battery:txt(o.battery,100),note:txt(o.note,900),
      imageAssets,images,
      createdAt:txt(o.createdAt,40),updatedAt:txt(o.updatedAt,40)||s.updatedAt
    };
  });
}
