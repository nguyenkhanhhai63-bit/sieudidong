import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";

const KEY="ai:knowledge:items:v1";
const MAX_ITEMS=500;

function clean(v,max=2000){
  return String(v??"")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"")
    .replace(/\r\n?/g,"\n")
    .trim()
    .slice(0,max);
}

function normalizeItem(x={}){
  const now=new Date().toISOString();
  const status=["pending","answered","ignored"].includes(String(x.status))?String(x.status):"pending";
  return {
    id:clean(x.id,120)||`k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,
    question:clean(x.question,1200),
    missing:clean(x.missing,1000),
    answer:clean(x.answer,2000),
    count:Math.max(1,Number(x.count||1)||1),
    firstAskedAt:clean(x.firstAskedAt,80)||now,
    lastAskedAt:clean(x.lastAskedAt,80)||clean(x.updatedAt,80)||now,
    status,
    source:clean(x.source,80)||"admin",
    updatedAt:clean(x.updatedAt,80)||now
  };
}

async function readItems(){
  const raw=await redisCommand(["GET",KEY]);
  if(!raw) return [];
  try{
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean).map(normalizeItem).slice(0,MAX_ITEMS);
  }catch(_){
    return [];
  }
}

async function writeItems(items){
  const normalized=(Array.isArray(items)?items:[]).filter(Boolean).map(normalizeItem).slice(0,MAX_ITEMS);
  const encoded=JSON.stringify(normalized);
  await redisCommand(["SET",KEY,encoded]);
  const verify=await redisCommand(["GET",KEY]);
  if(!verify) throw new Error("Redis không đọc lại được kho kiến thức AI vừa lưu.");
  let parsed;
  try{parsed=JSON.parse(verify);}catch(_){throw new Error("Kho kiến thức AI trên Redis không hợp lệ.");}
  if(!Array.isArray(parsed)) throw new Error("Kho kiến thức AI trên Redis sai định dạng.");
  return parsed.map(normalizeItem).slice(0,MAX_ITEMS);
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma","no-cache");

  if(!(await isAdmin(req))) return res.status(401).json({error:"Unauthorized"});

  if(req.method==="GET"){
    try{
      const items=await readItems();
      return res.status(200).json({ok:true,items,storage:KEY});
    }catch(err){
      console.error("AI knowledge read:",err?.message||err);
      return res.status(500).json({error:"Không tải được kho kiến thức AI: "+(err?.message||"Redis error")});
    }
  }

  if(req.method==="POST"){
    try{
      const body=req.body||{};
      const action=clean(body.action,40)||"answer";
      let items=await readItems();
      const now=new Date().toISOString();

      if(action==="manual"){
        const question=clean(body.question,1200);
        const answer=clean(body.answer,2000);
        const missing=clean(body.missing,1000)||"Kiến thức Shop bổ sung thủ công";
        if(!question||!answer) return res.status(400).json({error:"Cần nhập cả câu hỏi/chủ đề và câu trả lời đúng."});
        const item=normalizeItem({
          id:`k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,
          question,missing,answer,count:1,
          firstAskedAt:now,lastAskedAt:now,updatedAt:now,
          status:"answered",source:"admin-manual"
        });
        items.unshift(item);
        items=await writeItems(items);
        return res.status(200).json({ok:true,persisted:true,item,items,storage:KEY});
      }

      const id=clean(body.id,120);
      if(!id) return res.status(400).json({error:"Thiếu ID kiến thức AI."});
      const idx=items.findIndex(x=>String(x.id)===id);
      if(idx<0) return res.status(404).json({error:"Không tìm thấy câu hỏi cần đào tạo."});

      if(action==="answer"){
        const answer=clean(body.answer,2000);
        if(!answer) return res.status(400).json({error:"Bạn chưa nhập câu trả lời đúng cho AI."});
        items[idx]={...items[idx],answer,status:"answered",source:items[idx].source||"admin",updatedAt:now};
      }else if(action==="ignore"){
        items[idx]={...items[idx],status:"ignored",updatedAt:now};
      }else if(action==="reopen"){
        items[idx]={...items[idx],status:"pending",updatedAt:now};
      }else{
        return res.status(400).json({error:"Thao tác đào tạo AI không hợp lệ."});
      }

      items=await writeItems(items);
      const saved=items.find(x=>String(x.id)===id);
      if(!saved) throw new Error("Không xác minh được dữ liệu vừa lưu.");
      if(action==="answer" && (saved.status!=="answered" || !saved.answer)){
        throw new Error("Redis chưa lưu câu trả lời đào tạo AI.");
      }
      return res.status(200).json({ok:true,persisted:true,item:saved,items,storage:KEY});
    }catch(err){
      console.error("AI knowledge save:",err?.message||err);
      return res.status(500).json({error:"Không lưu được đào tạo AI: "+(err?.message||"Redis error")});
    }
  }

  if(req.method==="DELETE"){
    try{
      const id=clean(req.body?.id||req.query?.id,120);
      if(!id) return res.status(400).json({error:"Thiếu ID kiến thức AI."});
      const items=await readItems();
      const next=items.filter(x=>String(x.id)!==id);
      if(next.length===items.length) return res.status(404).json({error:"Không tìm thấy câu hỏi cần xóa."});
      const saved=await writeItems(next);
      return res.status(200).json({ok:true,persisted:true,items:saved,storage:KEY});
    }catch(err){
      console.error("AI knowledge delete:",err?.message||err);
      return res.status(500).json({error:"Không xóa được kiến thức AI: "+(err?.message||"Redis error")});
    }
  }

  res.setHeader("Allow","GET, POST, DELETE");
  return res.status(405).json({error:"Method not allowed"});
}
