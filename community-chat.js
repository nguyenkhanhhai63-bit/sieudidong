(()=>{
  if(window.__SDD_COMMUNITY_CHAT__)return; window.__SDD_COMMUNITY_CHAT__=true;
  const API="/api/community-chat";
  const SID_KEY="sdd_community_sid_v1", NICK_KEY="sdd_community_nick_v1";
  const esc=s=>String(s??"").replace(/[&<>\"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  function sid(){let x="";try{x=localStorage.getItem(SID_KEY)||""}catch{} if(!x){x="c_"+Date.now().toString(36)+Math.random().toString(36).slice(2,9);try{localStorage.setItem(SID_KEY,x)}catch{}}return x}
  function nick(){let x="";try{x=localStorage.getItem(NICK_KEY)||""}catch{} if(!x){x="Khách "+String(Math.floor(1000+Math.random()*9000));try{localStorage.setItem(NICK_KEY,x)}catch{}}return x}
  const SESSION=sid(); let NICK=nick(), open=false, timer=null, lastHtml="", cfg={enabled:true,title:"Cộng đồng Siêu Di Động",announcement:""};
  const wrap=document.createElement("div");
  wrap.innerHTML=`
  <button class="community-launcher" id="communityLauncher" type="button" aria-label="Mở cộng đồng"><span class="community-launcher-icon">💬</span><span class="community-launcher-copy"><b>Cộng đồng</b><small><i></i><span id="communityOnlineMini">Đang online</span></small></span></button>
  <section class="community-panel" id="communityPanel" hidden aria-label="Cộng đồng Siêu Di Động">
    <header class="community-head"><div><strong id="communityTitle">Cộng đồng Siêu Di Động</strong><span><i></i><b id="communityOnline">0</b> người online</span></div><button id="communityClose" type="button">×</button></header>
    <div id="communityAnnouncement" class="community-announcement"></div>
    <div class="community-namebar"><span>Bạn đang chat với tên</span><button id="communityNickBtn" type="button"></button></div>
    <div id="communityMessages" class="community-messages"><div class="community-loading">Đang kết nối cộng đồng...</div></div>
    <form id="communityForm" class="community-form"><textarea id="communityInput" maxlength="500" rows="1" placeholder="Nhắn gì đó với mọi người..."></textarea><button type="submit">Gửi</button></form>
    <div id="communityStatus" class="community-status">Không cần đăng nhập • Không chia sẻ thông tin cá nhân nhạy cảm</div>
  </section>`;
  document.body.appendChild(wrap);
  const $=id=>document.getElementById(id), launcher=$("communityLauncher"),panel=$("communityPanel"),messages=$("communityMessages"),input=$("communityInput"),form=$("communityForm"),status=$("communityStatus");
  $("communityNickBtn").textContent=NICK;
  function fmt(ts){try{return new Intl.DateTimeFormat("vi-VN",{hour:"2-digit",minute:"2-digit"}).format(new Date(ts))}catch{return""}}
  function render(items){
    const html=(Array.isArray(items)?items:[]).map(m=>{
      const mine=m.sessionId===SESSION, staff=m.role==="staff";
      return `<div class="community-msg ${mine?"mine":""} ${staff?"staff":""}"><div class="community-meta"><b>${esc(m.nickname||"Khách")}${staff?' <em>✓</em>':''}</b><span>${fmt(m.at)}</span></div><div class="community-bubble">${esc(m.text||"")}</div></div>`;
    }).join("")||'<div class="community-empty"><b>Chưa có ai nhắn.</b><span>Bạn mở lời trước nha 👋</span></div>';
    if(html===lastHtml)return; lastHtml=html; const atBottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<90; messages.innerHTML=html; if(atBottom||!messages.dataset.ready){messages.scrollTop=messages.scrollHeight;messages.dataset.ready="1"}
  }
  async function load(){
    try{
      const r=await fetch(`${API}?sessionId=${encodeURIComponent(SESSION)}&nickname=${encodeURIComponent(NICK)}&_=${Date.now()}`,{cache:"no-store"}); const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Không kết nối được"); cfg=d.settings||cfg;
      launcher.hidden=cfg.enabled===false; if(cfg.enabled===false&&open)closePanel();
      $("communityTitle").textContent=cfg.title||"Cộng đồng Siêu Di Động"; $("communityAnnouncement").textContent=cfg.announcement||""; $("communityAnnouncement").hidden=!cfg.announcement;
      $("communityOnline").textContent=String(d.online||0); $("communityOnlineMini").textContent=`${d.online||0} online`; render(d.messages||[]);
      if(d.banned){input.disabled=true; form.querySelector("button").disabled=true; status.textContent="Tài khoản chat này đang bị hạn chế gửi tin nhắn."}
    }catch(e){if(open)status.textContent=e.message||"Mất kết nối, đang thử lại..."}
  }
  function openPanel(){open=true; panel.hidden=false; launcher.classList.add("active"); load(); timer&&clearInterval(timer); timer=setInterval(load,2400); setTimeout(()=>input?.focus(),180)}
  function closePanel(){open=false;panel.hidden=true;launcher.classList.remove("active");timer&&clearInterval(timer);timer=null}
  launcher.addEventListener("click",()=>open?closePanel():openPanel()); $("communityClose").addEventListener("click",closePanel);
  $("communityNickBtn").addEventListener("click",()=>{const v=prompt("Tên hiển thị trong cộng đồng:",NICK);if(v==null)return;const x=String(v).replace(/[<>]/g,"").trim().slice(0,24);if(!x)return;NICK=x;try{localStorage.setItem(NICK_KEY,NICK)}catch{} $("communityNickBtn").textContent=NICK;load()});
  input.addEventListener("input",()=>{input.style.height="auto";input.style.height=Math.min(92,input.scrollHeight)+"px"});
  input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();form.requestSubmit()}});
  form.addEventListener("submit",async e=>{e.preventDefault();const text=input.value.trim();if(!text)return;const btn=form.querySelector("button");btn.disabled=true;status.textContent="Đang gửi...";try{const r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"send",sessionId:SESSION,nickname:NICK,text})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Không gửi được");input.value="";input.style.height="auto";status.textContent="Đã gửi • Cộng đồng cập nhật gần như tức thì";await load()}catch(err){status.textContent=err.message||"Không gửi được tin nhắn"}finally{btn.disabled=false}});
  load(); setInterval(()=>{if(!open)load()},15000);
})();
