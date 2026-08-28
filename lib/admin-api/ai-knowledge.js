import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";

const KEY="ai:knowledge:items:v1";

function clean(v,max=2000){
  return String(v??"")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"")
    .replace(/<>/g,"")
    .trim()
    .slice(0,max);
}

function uid(){
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
}

async function readItems(){
  try{
    const raw=await redisCommand(["GET",KEY]);
    if(!raw) return [];
    const arr=JSON.parse(raw);
    return Array.isArray(arr)?arr:[];
  }catch(_){
    return [];
  }
}

async function writeItems(items){
  const safe=(Array.isArray(items)?items:[]).slice(0,500);
  await redisCommand(["SET",KEY,JSON.stringify(safe)]);
  return safe;
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
  if(!(await isAdmin(req))) return res.status(401).json({error:"Unauthorized"});

  if(req.method==="GET"){
    const items=await readItems();
    const pending=items.filter(x=>x.status!=="answered" && x.status!=="ignored").length;
    const answered=items.filter(x=>x.status==="answered" && x.answer).length;
    return res.status(200).json({ok:true,items,pending,answered});
  }

  if(req.method==="POST"){
    const body=req.body||{};
    const action=clean(body.action,40)||"answer";
    const items=await readItems();

    if(action==="manual"){
      const question=clean(body.question,1200);
      const missing=clean(body.missing,1000)||"Thông tin shop cần bổ sung";
      const answer=clean(body.answer,2500);
      if(!question) return res.status(400).json({error:"Thiếu câu hỏi"});
      const now=new Date().toISOString();
      items.unshift({
        id:uid(),question,missing,answer,count:1,firstAskedAt:now,lastAskedAt:now,
        status:answer?"answered":"pending",source:"manual",updatedAt:now
      });
      await writeItems(items);
      return res.status(200).json({ok:true});
    }

    const id=clean(body.id,120);
    const idx=items.findIndex(x=>String(x.id)===id);
    if(idx<0) return res.status(404).json({error:"Không tìm thấy mục AI cần bổ sung"});

    if(action==="ignore"){
      items[idx]={...items[idx],status:"ignored",updatedAt:new Date().toISOString()};
      await writeItems(items);
      return res.status(200).json({ok:true,item:items[idx]});
    }

    if(action==="reopen"){
      items[idx]={...items[idx],status:"pending",updatedAt:new Date().toISOString()};
      await writeItems(items);
      return res.status(200).json({ok:true,item:items[idx]});
    }

    const answer=clean(body.answer,2500);
    if(!answer) return res.status(400).json({error:"Bạn chưa nhập thông tin cho AI"});
    items[idx]={...items[idx],answer,status:"answered",updatedAt:new Date().toISOString()};
    await writeItems(items);
    return res.status(200).json({ok:true,item:items[idx]});
  }

  if(req.method==="DELETE"){
    const id=clean(req.body?.id||req.query?.id,120);
    if(!id) return res.status(400).json({error:"Thiếu ID"});
    const items=await readItems();
    const next=items.filter(x=>String(x.id)!==id);
    await writeItems(next);
    return res.status(200).json({ok:true});
  }

  res.setHeader("Allow","GET, POST, DELETE");
  return res.status(405).json({error:"Method not allowed"});
}
