
(function(){
  "use strict";

  function initWarrantyMobileMenu(){
    var btn = document.getElementById("sddMobileMenuBtn");
    var drawer = document.getElementById("sddMobileDrawer");
    var closeBtn = document.getElementById("sddMobileDrawerClose");

    if(!btn || !drawer) return;

    function openMenu(){
      drawer.hidden = false;
      drawer.removeAttribute("hidden");
      drawer.setAttribute("aria-hidden","false");
      btn.setAttribute("aria-expanded","true");

      drawer.style.setProperty("display","block","important");
      drawer.style.setProperty("visibility","visible","important");
      drawer.style.setProperty("opacity","1","important");
      drawer.style.setProperty("pointer-events","auto","important");

      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    }

    function closeMenu(){
      drawer.hidden = true;
      drawer.setAttribute("hidden","");
      drawer.setAttribute("aria-hidden","true");
      btn.setAttribute("aria-expanded","false");

      drawer.style.removeProperty("display");
      drawer.style.removeProperty("visibility");
      drawer.style.removeProperty("opacity");
      drawer.style.removeProperty("pointer-events");

      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }

    // Capture phase để thắng các listener khác nếu có.
    btn.addEventListener("click", function(e){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if(drawer.hasAttribute("hidden")) openMenu();
      else closeMenu();
    }, true);

    btn.addEventListener("touchend", function(e){
      e.preventDefault();
      e.stopPropagation();

      if(drawer.hasAttribute("hidden")) openMenu();
      else closeMenu();
    }, {capture:true, passive:false});

    if(closeBtn){
      closeBtn.addEventListener("click", function(e){
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      }, true);
    }

    drawer.addEventListener("click", function(e){
      if(e.target === drawer) closeMenu();
    }, true);

    drawer.querySelectorAll("a").forEach(function(a){
      a.addEventListener("click", function(){
        setTimeout(closeMenu, 20);
      });
    });

    closeMenu();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", initWarrantyMobileMenu, {once:true});
  } else {
    initWarrantyMobileMenu();
  }
})();
