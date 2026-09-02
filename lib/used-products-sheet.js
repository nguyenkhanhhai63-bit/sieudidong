import { redisCommand } from "./redis.js";

export const USED_SHEET_ID="1XXVLikPffW1E_Wd6Rbg5qZCeL3neBEXXQqZg4vK6Sjw";
export const USED_SHEET_GID="1593814067";
export const DEFAULT_USED_SHEET_URL=`https://docs.google.com/spreadsheets/d/${USED_SHEET_ID}/edit?gid=${USED_SHEET_GID}#gid=${USED_SHEET_GID}`;
const SETTINGS_KEY="used:sheet:settings:v1";
const CACHE_KEY="used:sheet:cache:v4";
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
function headerIndex(header=[]){
  const map={};
  header.forEach((value,index)=>{const k=norm(value);if(k && map[k]===undefined)map[k]=index});
  return map;
}
function col(map,row,names=[],fallback=-1){
  for(const name of names){
    const i=map[norm(name)];
    if(i!==undefined) return row[i];
  }
  return fallback>=0?row[fallback]:"";
}
function rowToItem(r,index,map={}){
  // New Sheet layout (2026-09):
  // STT | TÊN MÁY | HÃNG | MÀU | ROM | PHỤ KIỆN | TÌNH TRẠNG | DUNG LƯỢNG | IMEI |
  // GIÁ NHẬP | GIÁ BÁN | LỢI NHUẬN | NGÀY NHẬP | NGÀY BÁN | BẢO HÀNH | TRẠNG THÁI
  // Header based lookup keeps syncing even if columns are moved later.
  const stt=txt(col(map,r,["stt"],0),30);
  const name=txt(col(map,r,["tên máy","ten may"],1),140);
  const brand=txt(col(map,r,["hãng","hang"],2),60);
  if(!name) return null;

  const color=txt(col(map,r,["màu","mau"],3),60);
  const rom=txt(col(map,r,["rom"],-1),80);
  const accessories=txt(col(map,r,["phụ kiện","phu kien"],9),240);
  const condition=txt(col(map,r,["tình trạng","tinh trang","ngoại hình","ngoai hinh"],3),100);
  const note=txt(col(map,r,["ghi chú","ghi chu"],-1),900);
  const memory=txt(col(map,r,["dung lượng","dung luong","bộ nhớ","bo nho"],4),60);
  const imei=txt(col(map,r,["imei"],5),80);
  const costPrice=digits(col(map,r,["giá nhập","gia nhap"],6));
  const price=digits(col(map,r,["giá bán","gia ban"],7));
  const profit=digits(col(map,r,["lợi nhuận","loi nhuan"],8));
  const dateIn=txt(col(map,r,["ngày nhập","ngay nhap"],10),40);
  const dateSold=txt(col(map,r,["ngày bán","ngay ban"],11),40);
  const warranty=txt(col(map,r,["bảo hành","bao hanh"],12),140);
  const status=statusOf(col(map,r,["trạng thái","trang thai"],13));

  return {
    id:`sheet_${idPart(imei||stt||String(index+1))}_${index+1}`,
    source:"sheet",sheetRow:index+2,stt,name,brand,color,rom,condition,note,memory,imei,
    costPrice,price,profit,accessories,dateIn,dateSold,warranty,status,
    battery:"",imageAssets:[],images:[],updatedAt:new Date().toISOString()
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
    const headerRow=table[0]||[];
    const header=headerRow.map(norm).join("|");
    if(!header.includes("ten may") || !header.includes("gia ban")) throw new Error("Không nhận đúng bảng máy cũ");
    const map=headerIndex(headerRow);
    const items=table.slice(1).map((row,index)=>rowToItem(row,index,map)).filter(Boolean).slice(0,1000);
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
function keysOf(x={}){
  const imei=norm(x.imei), name=norm(x.name), memory=norm(x.memory);
  const keys=[];
  if(imei){
    // Prefer a more specific key because some stores only enter the last 4 IMEI digits.
    keys.push(`i:${imei}|${name}|${memory}`);
    // Backward compatibility with overlays created by older versions.
    keys.push(`i:${imei}`);
  }
  keys.push(`n:${name}|${memory}`);
  return keys.filter(Boolean);
}
export function mergeSheetWithOverlays(sheetItems=[],overlays=[]){
  const map=new Map();
  for(const x of Array.isArray(overlays)?overlays:[]){
    for(const k of keysOf(x)) if(k&&!map.has(k))map.set(k,x);
  }
  return (Array.isArray(sheetItems)?sheetItems:[]).map(s=>{
    let o={};
    for(const k of keysOf(s)){if(map.has(k)){o=map.get(k)||{};break}}
    const imageAssets=Array.isArray(o.imageAssets)?o.imageAssets:[];
    const images=imageList(o);
    return {...s,
      id:String(o.id||s.id),
      // Sheet is the source of truth for color/ROM/condition. Redis only augments photos, battery and optional note.
      color:txt(s.color,60),rom:txt(s.rom,80),battery:txt(o.battery,100),note:txt(o.note,900)||txt(s.note,900),
      imageAssets,images,
      createdAt:txt(o.createdAt,40),updatedAt:txt(o.updatedAt,40)||s.updatedAt
    };
  });
}
