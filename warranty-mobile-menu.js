
(function(){
  "use strict";

  function initWarrantyMobileMenu(){
    var btn = document.getElementById("sddMobileMenuBtn");
    var drawer = document.getElementById("sddMobileDrawer");
    var closeBtn = document.getElementById("sddMobileDrawerClose");

    if(!btn || !drawer) return;

    // hidden làm drawer xuất hiện tức thì, bỏ hoàn toàn để animation chạy.
    drawer.removeAttribute("hidden");

    function openMenu(){
      drawer.setAttribute("aria-hidden","false");
      btn.setAttribute("aria-expanded","true");

      // đảm bảo browser ghi nhận trạng thái đóng trước khi mở
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          drawer.classList.add("is-open");
        });
      });

      document.documentElement.style.overflow="hidden";
      document.body.style.overflow="hidden";
    }

    function closeMenu(){
      drawer.classList.remove("is-open");
      drawer.setAttribute("aria-hidden","true");
      btn.setAttribute("aria-expanded","false");
      document.documentElement.style.overflow="";
      document.body.style.overflow="";
    }

    function toggleMenu(e){
      if(e){
        e.preventDefault();
        e.stopPropagation();
      }
      if(drawer.classList.contains("is-open")) closeMenu();
      else openMenu();
    }

    btn.onclick = toggleMenu;

    if(closeBtn){
      closeBtn.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      };
    }

    drawer.addEventListener("click",function(e){
      if(e.target===drawer) closeMenu();
    });

    drawer.querySelectorAll("a").forEach(function(a){
      a.addEventListener("click",closeMenu);
    });

    closeMenu();
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",initWarrantyMobileMenu,{once:true});
  }else{
    initWarrantyMobileMenu();
  }
})();
