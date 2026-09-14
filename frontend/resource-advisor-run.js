const token=()=>sessionStorage.getItem('musikbot187.auth')||'';
const node=id=>document.getElementById(id);
const valueIds=['advisorCpuMinimum','advisorCpuAverage','advisorCpuMaximum','advisorCoreUse','advisorRamMinimum','advisorRamAverage','advisorRamMaximum','advisorNetworkRxAverage','advisorNetworkRxP95','advisorNetworkRxMaximum','advisorNetworkTxAverage','advisorNetworkTxP95','advisorNetworkTxMaximum'];
const request=async(url,options={})=>{const headers={...options.headers},auth=token();if(auth)headers.authorization=`Bearer ${auth}`;const response=await fetch(url,{...options,headers}),body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);return body};
const number=(input,digits=1)=>Number(input||0).toLocaleString('de-DE',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const memory=(bytes,percent)=>`${Math.round(Number(bytes||0)/1048576)} MB (${number(percent)} %)`;
const rate=bytes=>{if(bytes==null)return '–';if(bytes<1024)return `${Math.round(bytes)} B/s`;if(bytes<1048576)return `${(bytes/1024).toFixed(1)} KiB/s`;return `${(bytes/1048576).toFixed(1)} MiB/s`};
const set=(id,text)=>{const target=node(id);if(target)target.textContent=text};

function clearAdvisor(){
  const progress=node('advisorProgress');if(progress)progress.style.width='0%';
  set('advisorProgressText','Neue 24-Stunden-Messung wird gestartet …');
  set('advisorDuration','0,0 von 24 Std.');
  for(const id of valueIds)set(id,'–');
  set('advisorMinimum','nach 24 Stunden');set('advisorOptimal','nach 24 Stunden');set('advisorMinimumNetwork','Netz nach 24 Stunden');set('advisorOptimalNetwork','Netz nach 24 Stunden');
  set('advisorDetail','Die vorherige Messung wurde geleert. Der nächste Systemmesswert startet den neuen 24-Stunden-Durchlauf; Live-Anzeigen und Netzwerk-Verbrauchshistorie laufen unabhängig weiter.');
}

function renderAdvisor(value){
  if(!value||typeof value!=='object')return;
  const progress=node('advisorProgress');if(progress)progress.style.width=`${Number(value.progressPercent)||0}%`;
  const completed=Boolean(value.completed),ready=Boolean(value.ready),samples=Number(value.samples)||0;
  set('advisorProgressText',ready?`Messung abgeschlossen · ${samples} Messwerte`:completed?`Messung abgeschlossen · ${samples} Messwerte · Abdeckung zu gering`:value.startedAt?`Lernphase ${Number(value.progressPercent)||0} % · ${samples} Messwerte`:'Neue 24-Stunden-Messung wartet auf den ersten Messwert');
  set('advisorDuration',`${number(value.collectedHours)} von 24 Std.`);
  for(const id of valueIds)set(id,'–');
  const cpu=value.cpu,ram=value.memory,network=value.network;
  if(cpu){set('advisorCpuMinimum',`${number(cpu.minimumPercent)} %`);set('advisorCpuAverage',`${number(cpu.averagePercent)} %`);set('advisorCpuMaximum',`${number(cpu.maximumPercent)} %`);set('advisorCoreUse',`${number(cpu.averageCores,2)} / ${number(cpu.maximumCores,2)}`)}
  if(ram){set('advisorRamMinimum',memory(ram.minimumBytes,ram.minimumPercent));set('advisorRamAverage',memory(ram.averageBytes,ram.averagePercent));set('advisorRamMaximum',memory(ram.maximumBytes,ram.maximumPercent))}
  if(network){set('advisorNetworkRxAverage',rate(network.averageRxBytesPerSecond));set('advisorNetworkRxP95',rate(network.p95RxBytesPerSecond));set('advisorNetworkRxMaximum',rate(network.maximumRxBytesPerSecond));set('advisorNetworkTxAverage',rate(network.averageTxBytesPerSecond));set('advisorNetworkTxP95',rate(network.p95TxBytesPerSecond));set('advisorNetworkTxMaximum',rate(network.maximumTxBytesPerSecond))}
  const recommendation=value.recommendation;
  if(recommendation){
    set('advisorMinimum',`${recommendation.minimum.cores} vCPU · ${Math.round(recommendation.minimum.memoryBytes/1073741824*10)/10} GB RAM`);set('advisorOptimal',`${recommendation.optimal.cores} vCPU · ${Math.round(recommendation.optimal.memoryBytes/1073741824*10)/10} GB RAM`);set('advisorMinimumNetwork',`Netz: ${number(recommendation.minimum.downloadMbps)} ↓ / ${number(recommendation.minimum.uploadMbps)} ↑ Mbit/s`);set('advisorOptimalNetwork',`Netz: ${number(recommendation.optimal.downloadMbps)} ↓ / ${number(recommendation.optimal.uploadMbps)} ↑ Mbit/s`);set('advisorDetail','24-Stunden-Messung abgeschlossen. Die Ergebnisse sind eingefroren und bleiben über Wartungsneustarts hinweg erhalten. „Messung neu starten“ beginnt bewusst einen komplett neuen Durchlauf.')
  }else if(completed){
    set('advisorMinimum','keine belastbare Auswertung');set('advisorOptimal','neue Messung empfohlen');set('advisorMinimumNetwork','zu wenige Messwerte');set('advisorOptimalNetwork','zu wenige Messwerte');set('advisorDetail',`Die 24-Stunden-Messung ist beendet, aber ${samples} Messwerte decken den Zeitraum nicht ausreichend ab. Die vorhandenen Messwerte bleiben erhalten; mit „Messung neu starten“ kannst du einen neuen Durchlauf beginnen.`)
  }else set('advisorDetail','Während des festen 24-Stunden-Durchlaufs gilt der sichere Startwert 2 vCPU, 2 GB RAM und 5/2 Mbit/s. Nach genau 24 Stunden stoppt diese Messung automatisch und behält ihre Ergebnisse.');
}

async function canReset(){try{const result=await request('/api/auth/me'),user=result.user;return Boolean(user&&(user.role==='admin'||(user.permissions||[]).includes('system.manage')))}catch{return false}}

async function enhanceAdvisor(){
  const card=document.querySelector('.resource-advisor-card');if(!card)return;
  let button=card.querySelector('.resource-advisor-reset');
  if(!button&&await canReset()){
    button=document.createElement('button');button.type='button';button.className='ghost resource-advisor-reset collapse-keep';button.textContent='Messung neu starten';button.title='Nur den 24-Stunden-Systemtest zurücksetzen und einen neuen Durchlauf beginnen';button.setAttribute('aria-label','24-Stunden-Messung neu starten');
    button.addEventListener('click',async()=>{button.disabled=true;clearAdvisor();try{const result=await request('/api/monitoring/advisor/reset',{method:'POST'});renderAdvisor(result);button.textContent='Messung neu gestartet';setTimeout(()=>{if(button.isConnected)button.textContent='Messung neu starten'},1800)}catch(error){set('advisorDetail',`Messung konnte nicht neu gestartet werden: ${error.message}`)}finally{button.disabled=false}});
    const collapse=card.querySelector(':scope > .panel-collapse');if(collapse)card.insertBefore(button,collapse);else card.append(button);
  }
  try{renderAdvisor(await request('/api/monitoring/advisor'))}catch{}
}

let scheduled=false;const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;void enhanceAdvisor()})};
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('DOMContentLoaded',schedule,{once:true});schedule();
