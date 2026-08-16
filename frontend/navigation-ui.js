(function(){
  function settingsBackButton(){
    const content=document.getElementById("content");
    const title=document.getElementById("title");
    if(!content||!title||title.textContent.trim()!=="Einstellungen")return;
    const hasTabs=!!content.querySelector(".tabs");
    let btn=document.getElementById("settings-back");
    if(hasTabs){if(btn)btn.remove();return}
    if(!btn){
      btn=document.createElement("button");
      btn.id="settings-back";
      btn.type="button";
      btn.textContent="↩ Zurück zu Einstellungen";
      btn.title="Zurück zur Einstellungen-Übersicht";
      btn.style.cssText="display:inline-flex;align-items:center;gap:8px;margin:0 0 14px 0;padding:9px 14px;border:1px solid rgba(130,180,255,.35);border-radius:10px;background:rgba(20,40,70,.75);color:#f4f8ff;font:inherit;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.18);";
      btn.onmouseenter=()=>{btn.style.background="rgba(35,75,125,.9)"};
      btn.onmouseleave=()=>{btn.style.background="rgba(20,40,70,.75)"};
      btn.onclick=()=>{if(typeof window.settingsView==="function")window.settingsView();};
    }
    if(!content.firstElementChild || content.firstElementChild!==btn)content.insertBefore(btn,content.firstChild);
  }
  const boot=()=>{
    settingsBackButton();
    const c=document.getElementById("content");
    if(c)new MutationObserver(settingsBackButton).observe(c,{childList:true,subtree:true});
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
