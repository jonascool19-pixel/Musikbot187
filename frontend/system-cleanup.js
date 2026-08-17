const systemTimers=new Set();
const originalSetTimeout=window.setTimeout.bind(window);
const originalClearTimeout=window.clearTimeout.bind(window);

window.setTimeout=(callback,delay,...args)=>{
  const id=originalSetTimeout(callback,delay,...args);
  try{
    if(typeof callback==='function' && delay===5000 && String(callback).includes('system()')) systemTimers.add(id);
  }catch{}
  return id;
};
window.clearTimeout=id=>{systemTimers.delete(id);return originalClearTimeout(id)};
function clearSystemTimers(){for(const id of systemTimers)originalClearTimeout(id);systemTimers.clear()}

document.addEventListener('click',event=>{
  const tab=event.target.closest?.('[data-tab]');
  if(tab&&tab.dataset.tab!=='system')clearSystemTimers();
  if(event.target.closest?.('#logout'))clearSystemTimers();
});
window.addEventListener('pagehide',clearSystemTimers);
