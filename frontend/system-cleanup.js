const systemTimers=new Set();
const clockTimers=new Set();
const originalSetTimeout=window.setTimeout.bind(window);
const originalClearTimeout=window.clearTimeout.bind(window);
const originalSetInterval=window.setInterval.bind(window);
const originalClearInterval=window.clearInterval.bind(window);

window.setTimeout=(callback,delay,...args)=>{
  const id=originalSetTimeout(callback,delay,...args);
  try{
    if(typeof callback==='function' && delay===5000 && String(callback).includes('system()')) systemTimers.add(id);
  }catch{}
  return id;
};
window.clearTimeout=id=>{systemTimers.delete(id);return originalClearTimeout(id)};
window.setInterval=(callback,delay,...args)=>{
  const id=originalSetInterval(callback,delay,...args);
  try{
    if(typeof callback==='function' && delay===1000 && String(callback).includes('toLocaleTimeString')) clockTimers.add(id);
  }catch{}
  return id;
};
window.clearInterval=id=>{systemTimers.delete(id);clockTimers.delete(id);return originalClearInterval(id)};
function clearSystemTimers(){for(const id of systemTimers)originalClearTimeout(id);systemTimers.clear()}
function clearClockTimers(){for(const id of clockTimers)originalClearInterval(id);clockTimers.clear()}

document.addEventListener('click',event=>{
  const tab=event.target.closest?.('[data-tab]');
  if(tab&&tab.dataset.tab!=='system')clearSystemTimers();
  if(event.target.closest?.('#logout')){clearSystemTimers();clearClockTimers()}
});
window.addEventListener('pagehide',()=>{clearSystemTimers();clearClockTimers()});
