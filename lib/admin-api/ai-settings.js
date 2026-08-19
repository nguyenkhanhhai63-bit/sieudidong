
import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";

const KEY="ai:compare:settings";

const DEFAULTS={
  customInstructions:
    "Ưu tiên tư vấn thực tế, dễ hiểu. Không tâng bốc sản phẩm. Khi chênh lệch giá đáng kể phải nói rõ máy đắt hơn có thực sự đáng tiền hay không.",
  recommendationStyle:"Rõ ràng, chốt 1 máy",
  responseLength:"Vừa phải",
  pricePriority:"Cân bằng",
  salesTone:"Tư vấn trung lập",
  mustMentionWeaknesses:true,
  mustComparePrice:true,
  allowTieRecommendation:true,
  chatInstructions:"Tư vấn ngắn gọn, bình dân, dễ hiểu. Hỏi nhu cầu nếu khách nói chưa rõ. Chỉ tư vấn dựa trên dữ liệu sản phẩm website gửi lên.",
  chatWelcomeMessage:"Chào bạn, cần tìm máy tầm giá nào hoặc muốn hỏi gì về Siêu Di Động?",
  chatStoreFacts:"Website: sieudidong.vn. Khu vực: Quy Nhơn. Zalo tư vấn: 0353105423.",
  chatHandoffRules:"Chỉ chuyển sang nhân viên khi cần xác nhận giá/tồn kho, địa chỉ, giờ mở cửa, chính sách hoặc khi dữ liệu AI không đủ."
};

function clean(v,max=4000){
  return String(v??"")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"")
    .trim()
    .slice(0,max);
}

function normalize(body={}){
  const styles=["Rõ ràng, chốt 1 máy","Cân bằng, nêu điều kiện chọn","Không ép chốt"];
  const lengths=["Ngắn gọn","Vừa phải","Chi tiết"];
  const price=["Ưu tiên giá tốt","Cân bằng","Ưu tiên cấu hình"];
  const tones=["Tư vấn trung lập","Bình dân, dễ hiểu","Chuyên gia kỹ thuật"];

  return {
    customInstructions:clean(body.customInstructions,4000),
    recommendationStyle:styles.includes(body.recommendationStyle)?body.recommendationStyle:DEFAULTS.recommendationStyle,
    responseLength:lengths.includes(body.responseLength)?body.responseLength:DEFAULTS.responseLength,
    pricePriority:price.includes(body.pricePriority)?body.pricePriority:DEFAULTS.pricePriority,
    salesTone:tones.includes(body.salesTone)?body.salesTone:DEFAULTS.salesTone,
    mustMentionWeaknesses:body.mustMentionWeaknesses!==false,
    mustComparePrice:body.mustComparePrice!==false,
    allowTieRecommendation:body.allowTieRecommendation!==false,
    chatInstructions:clean(body.chatInstructions,4000)||DEFAULTS.chatInstructions,
    chatWelcomeMessage:clean(body.chatWelcomeMessage,500)||DEFAULTS.chatWelcomeMessage,
    chatStoreFacts:clean(body.chatStoreFacts,2500)||DEFAULTS.chatStoreFacts,
    chatHandoffRules:clean(body.chatHandoffRules,1500)||DEFAULTS.chatHandoffRules
  };
}

async function readSettings(){
  try{
    const raw=await redisCommand(["GET",KEY]);
    if(!raw) return {...DEFAULTS};
    const parsed=JSON.parse(raw);
    return {...DEFAULTS,...normalize(parsed)};
  }catch(_){
    return {...DEFAULTS};
  }
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");

  if(!(await isAdmin(req))){
    return res.status(401).json({error:"Unauthorized"});
  }

  if(req.method==="GET"){
    return res.status(200).json({ok:true,settings:await readSettings()});
  }

  if(req.method==="POST"){
    const settings=normalize(req.body||{});
    await redisCommand(["SET",KEY,JSON.stringify(settings)]);
    return res.status(200).json({ok:true,settings});
  }

  if(req.method==="DELETE"){
    await redisCommand(["DEL",KEY]);
    return res.status(200).json({ok:true,settings:{...DEFAULTS}});
  }

  res.setHeader("Allow","GET, POST, DELETE");
  return res.status(405).json({error:"Method not allowed"});
}
