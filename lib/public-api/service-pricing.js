import { redisCommand } from "../redis.js";

const KEY="service:site:pricing";
const DEFAULTS={
  groups:[
    {id:"xiaomi-redmi",name:"XIAOMI & REDMI",rows:[
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
    ]},
    {id:"oneplus",name:"ONEPLUS",rows:[
      ["OnePlus ACE 6","Unlock SIM","300K","","200K"],
      ["OnePlus ACE 6T","Unlock SIM","300K","Up rom quốc tế","200K"],
      ["OnePlus ACE 5","Unlock SIM","300K","Up rom quốc tế","200K"],
      ["OnePlus 13","Unlock SIM","300K","Up rom quốc tế","200K"],
      ["OnePlus 15","Unlock SIM","300K","Up rom quốc tế","200K"]
    ]}
  ],
  note:"Giá có thể thay đổi tùy tình trạng máy và phiên bản phần mềm. Nhân viên sẽ kiểm tra và báo chính xác trước khi thực hiện."
};

export default async function handler(req,res){
  res.setHeader("Cache-Control","public, max-age=20, s-maxage=30");
  if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});
  try{
    const raw=await redisCommand(["GET",KEY]);
    return res.status(200).json({ok:true,settings:raw?JSON.parse(raw):DEFAULTS});
  }catch(_){
    return res.status(200).json({ok:true,settings:DEFAULTS});
  }
}
