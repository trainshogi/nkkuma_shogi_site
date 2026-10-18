(function () {
    "use strict";
  
    function enc(s){ return encodeURIComponent(s || ""); }
    function pageURL(){ return location.href.split("#")[0]; }
  
    function buildTwitterIntent(url, text, via){
      const base = "https://x.com/intent/post";
      const params = new URLSearchParams();
      if (text) params.set("text", text);
      if (url)  params.set("url", url);
      if (via)  params.set("via", via.replace(/^@/, ""));
      return `${base}?${params.toString()}`;
    }
  
    function buildFacebookShare(url){
      return `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`;
    }
  
    function init(){
      const block = document.getElementById("share-wrap");
      if(!block) return;
  
      const url = pageURL();
      const text = "将棋盤の写真から、局面をKIFにできます。"; // シェア文言
      const via  = "nkkuma_service";         // Xアカウント
  
      const xBtn  = block.querySelector("#share-x");
      const fbBtn = block.querySelector("#share-fb");
  
      if (xBtn) xBtn.href  = buildTwitterIntent(url, text, via);
      if (fbBtn) fbBtn.href = buildFacebookShare(url);
    }
  
    if(document.readyState==="loading"){
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  })();
  