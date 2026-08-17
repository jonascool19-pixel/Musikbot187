const systemIntervals=new Set();
const originalSetInterval=window.setInterval.bind(window);
const originalClearInterval=window.clearInterval.bind(window);
window.setInterval=(callback,delay,...args)=>{
  const id=originalSetInterval(callback,delay,...args);
  try{if(typeof callback==='function'&&String(callback).includes('/api/system'))systemIntervals.add(id)}catch{}
  return id;
};
window.clearInterval=id=>{systemIntervals.delete(id);return originalClearInterval(id)};
function clearSystemIntervals(){for(const id of systemIntervals)originalClearInterval(id);systemIntervals.clear()}
document.addEventListener('click',event=>{
  const tab=event.target.closest?.('[data-tab]');
  if(tab&&tab.dataset.tab!=='system')clearSystemIntervals();
  if(event.target.closest?.('#logout'))clearSystemIntervals();
});
window.addEventListener('pagehide',clearSystemIntervals);
