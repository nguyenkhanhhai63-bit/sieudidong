import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";

const KEY="service:site:pricing";
const DEFAULTS={
  groups:[
    {
      id:"xiaomi-redmi",
      name:"XIAOMI & REDMI",
      rows:[
        ["Redmi Turbo 4","Unlock bootloader","250K","Up rom quốc tế","250K"],
        ["Redmi Turbo 4 Pro","Unlock bootloader","250K","Up rom quốc tế","250K"],
        ["Redmi Turbo 5","Unlock bootloader","250K","Up rom quốc tế","250K"],
        ["Redmi Turbo 5 Max","Unlock bootloader","250K","Up rom quốc tế","250K"],
        ["Xiaomi 15","Unlock bootloader","250K","Up rom quốc tế","250K"],
        ["Xiaomi 17","Unlock bootloader","250K","Up rom quốc tế","250K"],
        ["Xiaomi 17 Max","Unlock bootloader","250K","Up rom quốc tế","250K"],
        ["Xiaomi 17 Pro","Unlock bootloader","250K","Up rom quốc tế","250K"],
        ["Xiaomi 17 Pro Max","Unlock bootloader","250K","Up rom quốc tế","250K"],
        ["Xiaomi 17 Pro Ultra","Unlock bootloader","250K","Up rom quốc tế","250K"],
        ["Redmi K90","Unlock bootloader","250K","Up rom quốc tế","250K"],
        ["Redmi K90 Max","Unlock bootloader","250K","Up rom quốc tế","250K"],
        ["Redmi K90 Pro Max","Unlock bootloader","250K","Up rom quốc tế","250K"],
        ["Redmi K80","Unlock bootloader","250K","Up rom quốc tế","250K"],
        ["Redmi K80 Ultra","Unlock bootloader","250K","Up rom quốc tế","250K"],
        ["Redmi Note 14 Pro Plus","Unlock bootloader","250K","Up rom quốc tế","250K"],
        ["Redmi Note 15 Pro Plus","Unlock bootloader","250K","Up rom quốc tế","250K"]
      ]
    },
    {
      id:"oneplus",
      name:"ONEPLUS",
      rows:[
        ["OnePlus ACE 6","Unlock SIM","300K","","200K"],
        ["OnePlus ACE 6T","Unlock SIM","300K","Up rom quốc tế","200K"],
        ["OnePlus ACE 5","Unlock SIM","300K","Up rom quốc tế","200K"],
        ["OnePlus 13","Unlock SIM","300K","Up rom quốc tế","200K"],
        ["OnePlus 15","Unlock SIM","300K","Up rom quốc tế","200K"]
      ]
    }
  ],
  note:"Giá có thể thay đổi tùy tình trạng máy và phiên bản phần mềm. Nhân viên sẽ kiểm tra và báo chính xác trước khi thực hiện."
};

function clean(v,max=180){return String(v??"").replace(/[<>]/g,"").trim().slice(0,max)}
function normalizeRow(r=[]){
  const a=Array.isArray(r)?r:[];
  return [
    clean(a[0],120),
    clean(a[1],120),
    clean(a[2],40),
    clean(a[3],120),
    clean(a[4],40)
  ];
}
function normalizeGroup(g={},i=0){
  return {
    id:clean(g.id,60)||`group-${i+1}`,
    name:clean(g.name,100)||`NHÓM ${i+1}`,
    rows:(Array.isArray(g.rows)?g.rows:[]).slice(0,100).map(normalizeRow).filter(r=>r.some(Boolean))
  };
}
function normalize(b={}){
  return {
    groups:(Array.isArray(b.groups)?b.groups:DEFAULTS.groups).slice(0,12).map(normalizeGroup),
    note:clean(b.note,1000)||DEFAULTS.note
  };
}
async function read(){
  try{
    const raw=await redisCommand(["GET",KEY]);
    return raw?normalize(JSON.parse(raw)):structuredClone(DEFAULTS);
  }catch(_){return structuredClone(DEFAULTS)}
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!(await isAdmin(req))) return res.status(401).json({error:"Unauthorized"});
  if(req.method==="GET") return res.status(200).json({ok:true,settings:await read()});
  if(req.method==="POST"){
    const settings=normalize(req.body||{});
    await redisCommand(["SET",KEY,JSON.stringify(settings)]);
    return res.status(200).json({ok:true,settings});
  }
  if(req.method==="DELETE"){
    await redisCommand(["DEL",KEY]);
    return res.status(200).json({ok:true,settings:structuredClone(DEFAULTS)});
  }
  res.setHeader("Allow","GET, POST, DELETE");
  return res.status(405).json({error:"Method not allowed"});
}
