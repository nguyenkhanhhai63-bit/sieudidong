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
  <button class="community-launcher community-launcher-fallback" id="communityLauncher" type="button" aria-label="Mở chat"><span class="community-launcher-icon"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M13.5 12.5h21A7.5 7.5 0 0 1 42 20v10A7.5 7.5 0 0 1 34.5 37H25l-8.2 5.8c-1.1.8-2.6 0-2.6-1.3V37h-.7A7.5 7.5 0 0 1 6 29.5V20a7.5 7.5 0 0 1 7.5-7.5Z"/><circle cx="17" cy="25" r="2.2"/><circle cx="24" cy="25" r="2.2"/><circle cx="31" cy="25" r="2.2"/></svg></span><span class="community-launcher-copy"><b>Chat</b><small><i></i><span id="communityOnlineMini">Đang online</span></small></span></button>
  <div class="shared-chat-menu" id="sharedChatMenu" hidden>
    <button type="button" class="shared-chat-choice ai" id="sharedChatAi">
      <span class="shared-chat-choice-icon"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M13.5 12.5h21A7.5 7.5 0 0 1 42 20v10A7.5 7.5 0 0 1 34.5 37H25l-8.2 5.8c-1.1.8-2.6 0-2.6-1.3V37h-.7A7.5 7.5 0 0 1 6 29.5V20a7.5 7.5 0 0 1 7.5-7.5Z"/><circle cx="17" cy="25" r="2.2"/><circle cx="24" cy="25" r="2.2"/><circle cx="31" cy="25" r="2.2"/></svg></span>
      <span><b>Tư vấn AI</b><small>Hỏi giá, cấu hình, còn hàng</small></span>
    </button>
    <button type="button" class="shared-chat-choice community" id="sharedChatCommunity">
      <span class="shared-chat-choice-icon people"><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="18" cy="18" r="6"/><circle cx="32" cy="20" r="5"/><path d="M7 39c.8-8 5.5-12 11-12s10.2 4 11 12"/><path d="M27 30c1.6-2 3.6-3 6-3 4.5 0 8 3.3 8 10"/></svg></span>
      <span><b>Cộng đồng</b><small><i></i><strong id="sharedChatOnline">0</strong> người đang online</small></span>
    </button>
  </div>
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
  const sharedAiLauncher=document.getElementById("zaloConsultBtn")||document.querySelector(".ai-chat-launcher");
  const sharedMenu=$("sharedChatMenu");
  let sharedMenuOpen=false, sharedBypass=false;
  if(sharedAiLauncher){
    launcher.hidden=true;
    sharedAiLauncher.setAttribute("aria-label","Mở chat Siêu Di Động");
    sharedAiLauncher.setAttribute("title","Tư vấn AI hoặc Chat cộng đồng");
  }
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
      $("communityOnline").textContent=String(d.online||0); $("communityOnlineMini").textContent=`${d.online||0} online`; if($("sharedChatOnline"))$("sharedChatOnline").textContent=String(d.online||0); render(d.messages||[]);
      if(d.banned){input.disabled=true; form.querySelector("button").disabled=true; status.textContent="Tài khoản chat này đang bị hạn chế gửi tin nhắn."}
    }catch(e){if(open)status.textContent=e.message||"Mất kết nối, đang thử lại..."}
  }
  function placeSharedMenu(){
    if(!sharedMenu||!sharedAiLauncher)return;
    const r=sharedAiLauncher.getBoundingClientRect();
    const menuW=Math.min(310,window.innerWidth-24);
    let left=Math.max(12,Math.min(window.innerWidth-menuW-12,r.right-menuW));
    let bottom=Math.max(12,window.innerHeight-r.top+10);
    sharedMenu.style.width=menuW+"px";
    sharedMenu.style.left=left+"px";
    sharedMenu.style.right="auto";
    sharedMenu.style.bottom=bottom+"px";
  }
  function closeSharedMenu(){sharedMenuOpen=false;if(sharedMenu)sharedMenu.hidden=true}
  function toggleSharedMenu(){
    if(!sharedMenu)return;
    sharedMenuOpen=!sharedMenuOpen;
    sharedMenu.hidden=!sharedMenuOpen;
    if(sharedMenuOpen){placeSharedMenu();load()}
  }
  function openAiChat(){
    closeSharedMenu();
    if(typeof window.aiChatOpen==="function"){window.aiChatOpen();return}
    if(sharedAiLauncher){
      sharedBypass=true;
      sharedAiLauncher.click();
      setTimeout(()=>{sharedBypass=false},0);
    }
  }
  function openPanel(){open=true; closeSharedMenu(); panel.hidden=false; launcher.classList.add("active"); document.body.classList.add("community-chat-open"); load(); timer&&clearInterval(timer); timer=setInterval(load,2400); setTimeout(()=>input?.focus(),180)}
  function closePanel(){open=false;panel.hidden=true;launcher.classList.remove("active");document.body.classList.remove("community-chat-open");timer&&clearInterval(timer);timer=null}
  launcher.addEventListener("click",()=>open?closePanel():openPanel());
  if(sharedAiLauncher){
    sharedAiLauncher.addEventListener("click",e=>{
      if(sharedBypass)return;
      if(document.body.classList.contains("ai-chat-open"))return;
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      if(open){closePanel();return}
      toggleSharedMenu();
    },true);
  }
  $("sharedChatAi")?.addEventListener("click",openAiChat);
  $("sharedChatCommunity")?.addEventListener("click",openPanel);
  document.addEventListener("click",e=>{
    if(!sharedMenuOpen)return;
    if(sharedMenu?.contains(e.target)||sharedAiLauncher?.contains(e.target))return;
    closeSharedMenu();
  });
  window.addEventListener("resize",()=>{if(sharedMenuOpen)placeSharedMenu()});
  window.addEventListener("scroll",()=>{if(sharedMenuOpen)placeSharedMenu()},{passive:true});
  $("communityClose").addEventListener("click",closePanel);
  $("communityNickBtn").addEventListener("click",()=>{const v=prompt("Tên hiển thị trong cộng đồng:",NICK);if(v==null)return;const x=String(v).replace(/[<>]/g,"").trim().slice(0,24);if(!x)return;NICK=x;try{localStorage.setItem(NICK_KEY,NICK)}catch{} $("communityNickBtn").textContent=NICK;load()});
  input.addEventListener("input",()=>{input.style.height="auto";input.style.height=Math.min(92,input.scrollHeight)+"px"});
  input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();form.requestSubmit()}});
  form.addEventListener("submit",async e=>{e.preventDefault();const text=input.value.trim();if(!text)return;const btn=form.querySelector("button");btn.disabled=true;status.textContent="Đang gửi...";try{const r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"send",sessionId:SESSION,nickname:NICK,text})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Không gửi được");input.value="";input.style.height="auto";status.textContent="Đã gửi • Cộng đồng cập nhật gần như tức thì";await load()}catch(err){status.textContent=err.message||"Không gửi được tin nhắn"}finally{btn.disabled=false}});
  load(); setInterval(()=>{if(!open)load()},15000);
})();
