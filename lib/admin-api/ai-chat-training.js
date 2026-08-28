
import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";

const KEY="ai:chat:training:v3";

const DEFAULTS={
  chatInstructions:"Tư vấn ngắn gọn, bình dân, dễ hiểu. Chủ động trả lời ngay khi hệ thống có dữ liệu. Hỏi thêm nhu cầu chỉ khi câu hỏi chưa đủ rõ. Không đẩy khách sang nhân viên nếu AI có thể trả lời từ dữ liệu website hoặc thông tin shop.",
  chatWelcomeMessage:"Chào bạn, cần tìm máy tầm giá nào hoặc muốn hỏi gì về Siêu Di Động?",
  chatStoreFacts:"Website: sieudidong.vn. Khu vực: Quy Nhơn. Zalo tư vấn: 0353105423. Shop có hỗ trợ trả góp qua công ty tài chính; thông tin đơn vị và hồ sơ lấy theo cấu hình Trả góp trong quản trị.",
  chatHandoffRules:"Chỉ chuyển sang nhân viên khi khách chủ động yêu cầu gặp người thật, cần giữ/chốt máy, cần ảnh thực tế, thương lượng riêng, hoặc dữ liệu cần thiết thực sự không có trong hệ thống. Giá, tồn kho, bảo hành, trả góp, địa chỉ, giờ mở cửa và chính sách nếu đã có dữ liệu thì AI phải tự trả lời.",
  chatSuggestions:"Máy dưới 10 triệu | Tư vấn giúp tôi máy dưới 10 triệu đang còn hàng\nPin trâu | Máy nào pin trâu đang còn hàng?\nChụp ảnh đẹp | Tôi cần máy chụp ảnh đẹp, tư vấn giúp tôi\nThông tin shop | Siêu Di Động ở đâu và liên hệ mua hàng thế nào?"
};

function clean(v,max){
  return String(v??"")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"")
    .replace(/\r\n?/g,"\n")
    .trim()
    .slice(0,max);
}

function normalize(body={}){
  return {
    chatInstructions:clean(body.chatInstructions,4000)||DEFAULTS.chatInstructions,
    chatWelcomeMessage:clean(body.chatWelcomeMessage,500)||DEFAULTS.chatWelcomeMessage,
    chatStoreFacts:clean(body.chatStoreFacts,2500)||DEFAULTS.chatStoreFacts,
    chatHandoffRules:clean(body.chatHandoffRules,1500)||DEFAULTS.chatHandoffRules,
    chatSuggestions:clean(body.chatSuggestions,4000)||DEFAULTS.chatSuggestions
  };
}

async function readSaved(){
  const raw=await redisCommand(["GET",KEY]);
  if(!raw) return {...DEFAULTS};
  try{
    return {...DEFAULTS,...JSON.parse(raw)};
  }catch(_){
    return {...DEFAULTS};
  }
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma","no-cache");

  if(!(await isAdmin(req))){
    return res.status(401).json({error:"Unauthorized"});
  }

  if(req.method==="GET"){
    return res.status(200).json({
      ok:true,
      settings:await readSaved(),
      storage:"ai:chat:training:v3"
    });
  }

  if(req.method==="POST"){
    try{
      const settings=normalize(req.body||{});
      const encoded=JSON.stringify(settings);

      await redisCommand(["SET",KEY,encoded]);

      const raw=await redisCommand(["GET",KEY]);
      if(!raw){
        return res.status(500).json({error:"Redis không đọc lại được dữ liệu AI chat vừa lưu."});
      }

      let saved;
      try{ saved=JSON.parse(raw); }
      catch(_){
        return res.status(500).json({error:"Dữ liệu AI chat trên Redis không hợp lệ."});
      }

      const fields=["chatInstructions","chatWelcomeMessage","chatStoreFacts","chatHandoffRules","chatSuggestions"];
      const mismatch=fields.find(k=>String(saved[k]??"")!==String(settings[k]??""));
      if(mismatch){
        return res.status(500).json({
          error:"Redis chưa lưu đúng mục: "+mismatch,
          field:mismatch
        });
      }

      return res.status(200).json({
        ok:true,
        persisted:true,
        verified:true,
        settings:{...DEFAULTS,...saved},
        storage:"ai:chat:training:v3"
      });
    }catch(err){
      console.error("AI chat training save:",err?.message||err);
      return res.status(500).json({
        error:"Không lưu được Đào tạo AI: "+(err?.message||"Redis error")
      });
    }
  }

  if(req.method==="DELETE"){
    await redisCommand(["DEL",KEY]);
    return res.status(200).json({ok:true,settings:{...DEFAULTS}});
  }

  res.setHeader("Allow","GET, POST, DELETE");
  return res.status(405).json({error:"Method not allowed"});
}
