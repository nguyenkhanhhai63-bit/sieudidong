import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";

const KEY="site:footer:settings:v1";
const ICONS=new Set(["store","shield","users","grid","headset","map-pin","search","percent","globe","mail","check","phone","credit-card","tools","box"]);
const DEFAULTS={
  storeTitle:"CỬA HÀNG SIÊU DI ĐỘNG",
  storeName:"Siêu Di Động Quy Nhơn",
  address:"228 Nguyễn Thái Học, P. Quy Nhơn Nam, Gia Lai",
  phone:"0353 105 423",
  mapLabel:"Xem bản đồ",
  mapUrl:"https://maps.app.goo.gl/UiCEUDngLYEmbTWT7",
  zaloLabel:"Nhắn Zalo",
  zaloUrl:"https://zalo.me/0353105423",
  hotlineTitle:"Hotline tư vấn",
  hotlineNote:"Hỗ trợ trong giờ mở cửa",
  policyTitle:"HỖ TRỢ & CHÍNH SÁCH",
  policyItems:[
    {label:"Chính sách bảo hành",url:"/tra-cuu-bao-hanh/"},
    {label:"Tra cứu bảo hành",url:"/tra-cuu-bao-hanh/"},
    {label:"Chính sách trả góp",url:"/tra-gop/"},
    {label:"Dịch vụ tại cửa hàng",url:"/dich-vu/"},
    {label:"Sản phẩm theo yêu cầu",url:"/order-may/"}
  ],
  commitmentTitle:"CAM KẾT TỪ SIÊU DI ĐỘNG",
  commitments:["Tư vấn rõ ràng trước khi mua","1 đổi 1 trong 30 ngày lỗi NSX","Mainboard bảo hành 12 tháng","Hỗ trợ cài đặt phần mềm"],
  connectTitle:"KẾT NỐI VỚI CHÚNG TÔI",
  connectIntro:"Cần tư vấn sản phẩm, bảo hành hoặc tình trạng hàng? Liên hệ trực tiếp với Siêu Di Động.",
  socials:[
    {type:"zalo",label:"Zalo tư vấn",url:"https://zalo.me/0353105423"},
    {type:"tiktok",label:"TikTok Siêu Di Động",url:"https://www.tiktok.com/@sieudidongquynhon"},
    {type:"website",label:"sieudidong.vn",url:"https://sieudidong.vn/"}
  ],
  newsletterTitle:"ĐĂNG KÝ NHẬN TIN",
  newsletterText:"Nhận thông tin sản phẩm và chương trình mới từ Siêu Di Động.",
  utilityTitle:"TIỆN ÍCH KHÁCH HÀNG",
  utilities:[
    {icon:"search",label:"Tra cứu",sub:"Bảo hành",url:"/tra-cuu-bao-hanh/"},
    {icon:"percent",label:"Trả góp",sub:"Tư vấn hồ sơ",url:"/tra-gop/"},
    {icon:"headset",label:"Hỗ trợ",sub:"Nhắn Zalo",url:"https://zalo.me/0353105423"},
    {icon:"store",label:"Cửa hàng",sub:"Tại Quy Nhơn",url:"/dich-vu/"}
  ],
  paymentTitle:"Hình thức thanh toán",
  payments:["Tiền mặt","Chuyển khoản","Trả góp"],
  brandName:"SIÊU DI ĐỘNG",
  brandTagline:"CHUYÊN ANDROID GIÁ TỐT",
  bottomTrust1:"Uy tín · Tận tâm · Hỗ trợ rõ ràng",
  bottomTrust2:"Cửa hàng tại Quy Nhơn",
  copyright:"© 2026 Siêu Di Động. All rights reserved.",
  developer:"Website: sieudidong.vn · Developed by haimmo",
  accent:"#ff5a00",
  background:"#111b25",
  backgroundBottom:"#0c1620",
  text:"#f8fafc",
  muted:"#b8c2cc",
  iconStore:"store",
  iconPolicy:"shield",
  iconConnect:"users",
  iconUtility:"grid",
  iconHotline:"headset"
};
function text(v,max=300){return String(v??"").replace(/[<>]/g,"").trim().slice(0,max)}
function url(v){const s=text(v,500); return /^(https?:\/\/|\/)/i.test(s)?s:""}
function color(v,d){return /^#[0-9a-f]{6}$/i.test(String(v||""))?String(v):d}
function icon(v,d){v=text(v,40);return ICONS.has(v)?v:d}
function listText(v,max=8){return (Array.isArray(v)?v:[]).slice(0,max).map(x=>text(x,160)).filter(Boolean)}
function policy(v){return (Array.isArray(v)?v:[]).slice(0,8).map(x=>({label:text(x?.label,120),url:url(x?.url)})).filter(x=>x.label)}
function socials(v){return (Array.isArray(v)?v:[]).slice(0,6).map(x=>({type:["zalo","tiktok","website","facebook","youtube","instagram"].includes(x?.type)?x.type:"website",label:text(x?.label,100),url:url(x?.url)})).filter(x=>x.label)}
function utilities(v){return (Array.isArray(v)?v:[]).slice(0,4).map(x=>({icon:icon(x?.icon,"grid"),label:text(x?.label,60),sub:text(x?.sub,80),url:url(x?.url)})).filter(x=>x.label)}
function normalize(body={}){
  return {
    storeTitle:text(body.storeTitle||DEFAULTS.storeTitle,100),storeName:text(body.storeName||DEFAULTS.storeName,120),address:text(body.address||DEFAULTS.address,220),phone:text(body.phone||DEFAULTS.phone,40),mapLabel:text(body.mapLabel||DEFAULTS.mapLabel,60),mapUrl:url(body.mapUrl)||DEFAULTS.mapUrl,zaloLabel:text(body.zaloLabel||DEFAULTS.zaloLabel,60),zaloUrl:url(body.zaloUrl)||DEFAULTS.zaloUrl,hotlineTitle:text(body.hotlineTitle||DEFAULTS.hotlineTitle,80),hotlineNote:text(body.hotlineNote||DEFAULTS.hotlineNote,120),
    policyTitle:text(body.policyTitle||DEFAULTS.policyTitle,100),policyItems:policy(body.policyItems).length?policy(body.policyItems):DEFAULTS.policyItems,
    commitmentTitle:text(body.commitmentTitle||DEFAULTS.commitmentTitle,100),commitments:listText(body.commitments,8).length?listText(body.commitments,8):DEFAULTS.commitments,
    connectTitle:text(body.connectTitle||DEFAULTS.connectTitle,100),connectIntro:text(body.connectIntro||DEFAULTS.connectIntro,320),socials:socials(body.socials).length?socials(body.socials):DEFAULTS.socials,
    newsletterTitle:text(body.newsletterTitle||DEFAULTS.newsletterTitle,100),newsletterText:text(body.newsletterText||DEFAULTS.newsletterText,260),utilityTitle:text(body.utilityTitle||DEFAULTS.utilityTitle,100),utilities:utilities(body.utilities).length?utilities(body.utilities):DEFAULTS.utilities,paymentTitle:text(body.paymentTitle||DEFAULTS.paymentTitle,100),payments:listText(body.payments,5).length?listText(body.payments,5):DEFAULTS.payments,
    brandName:text(body.brandName||DEFAULTS.brandName,80),brandTagline:text(body.brandTagline||DEFAULTS.brandTagline,100),bottomTrust1:text(body.bottomTrust1||DEFAULTS.bottomTrust1,130),bottomTrust2:text(body.bottomTrust2||DEFAULTS.bottomTrust2,130),copyright:text(body.copyright||DEFAULTS.copyright,160),developer:text(body.developer||DEFAULTS.developer,180),
    accent:color(body.accent,DEFAULTS.accent),background:color(body.background,DEFAULTS.background),backgroundBottom:color(body.backgroundBottom,DEFAULTS.backgroundBottom),text:color(body.text,DEFAULTS.text),muted:color(body.muted,DEFAULTS.muted),iconStore:icon(body.iconStore,DEFAULTS.iconStore),iconPolicy:icon(body.iconPolicy,DEFAULTS.iconPolicy),iconConnect:icon(body.iconConnect,DEFAULTS.iconConnect),iconUtility:icon(body.iconUtility,DEFAULTS.iconUtility),iconHotline:icon(body.iconHotline,DEFAULTS.iconHotline)
  };
}
async function read(){try{const raw=await redisCommand(["GET",KEY]);return raw?normalize(JSON.parse(raw)):DEFAULTS}catch{return DEFAULTS}}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!(await isAdmin(req)))return res.status(401).json({error:"Unauthorized"});
  if(req.method==="GET")return res.status(200).json({ok:true,settings:await read()});
  if(req.method==="POST"){const settings=normalize(req.body||{});await redisCommand(["SET",KEY,JSON.stringify(settings)]);return res.status(200).json({ok:true,settings,updatedAt:Date.now()});}
  if(req.method==="DELETE"){await redisCommand(["DEL",KEY]);return res.status(200).json({ok:true,settings:DEFAULTS});}
  res.setHeader("Allow","GET, POST, DELETE");return res.status(405).json({error:"Method not allowed"});
}
