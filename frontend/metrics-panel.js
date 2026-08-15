(() => {
  const style = document.createElement('style');
  style.textContent = `
  .metrics-modal{position:fixed;inset:0;background:rgba(2,6,23,.78);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:20px;z-index:1000}
  .metrics-modal.open{display:flex}.metrics-box{width:min(900px,100%);max-height:90vh;overflow:auto;background:#0f172a;border:1px solid rgba(148,163,184,.18);border-radius:22px;box-shadow:0 24px 80px rgba(0,0,0,.45);padding:22px}
  .metrics-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.metrics-head h2{margin:0}.metrics-tabs{display:flex;gap:8px;margin:18px 0}.metrics-tab{border:1px solid rgba(148,163,184,.2);background:#111c31;color:#cbd5e1;border-radius:10px;padding:9px 14px;cursor:pointer}.metrics-tab.active{background:#7c3aed;color:#fff}
  .metrics-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.metric{background:#111c31;border:1px solid rgba(148,163,184,.12);border-radius:16px;padding:16px}.metric-top{display:flex;justify-content:space-between;gap:10px}.metric-label{color:#94a3b8;font-size:.86rem}.metric-value{font-size:1.35rem;font-weight:700;margin-top:5px}.metric-bar{height:7px;background:#1e293b;border-radius:99px;margin-top:12px;overflow:hidden}.metric-fill{height:100%;width:0%;background:linear-gradient(90deg,#7c3aed,#22d3ee);transition:width .4s ease}.net-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.net-card{padding:18px;border-radius:16px;background:#111c31}.net-rate{font-size:1.7rem;font-weight:800}.metrics-muted{color:#94a3b8;margin-top:12px;font-size:.85rem}@media(max-width:650px){.metrics-grid{grid-template-columns:1fr}.net-row{grid-template-columns:1fr}.metrics-modal{padding:10px}.metrics-box{padding:16px}}
  `;
  document.head.appendChild(style);
  const modal = document.createElement('div');
  modal.className = 'metrics-modal';
  modal.innerHTML = `<div class="metrics-box"><div class="metrics-head"><div><div class="eyebrow">LIVE MONITOR</div><h2>Leistung & Netzwerk</h2></div><button id="metricsClose">✕</button></div><div class="metrics-tabs"><button class="metrics-tab active" data-tab="system">System</button><button class="metrics-tab" data-tab="network">Netzwerk</button></div><div id="metricsSystem"><div class="metrics-grid"><div class="metric"><div class="metric-top"><span class="metric-label">CPU</span><b id="mCpu">—</b></div><div class="metric-bar"><div id="mCpuBar" class="metric-fill"></div></div><div id="mLoad" class="metrics-muted">Load —</div></div><div class="metric"><div class="metric-top"><span class="metric-label">RAM</span><b id="mRam">—</b></div><div class="metric-bar"><div id="mRamBar" class="metric-fill"></div></div><div id="mRamDetail" class="metrics-muted">—</div></div><div class="metric"><div class="metric-top"><span class="metric-label">Laufwerk</span><b id="mDisk">—</b></div><div class="metric-bar"><div id="mDiskBar" class="metric-fill"></div></div><div id="mDiskDetail" class="metrics-muted">—</div></div><div class="metric"><div class="metric-top"><span class="metric-label">CPU-Kerne</span><b id="mCores">—</b></div><div class="metrics-muted">Vom System erkannt</div></div></div></div><div id="metricsNetwork" hidden><div class="net-row"><div class="net-card"><div class="metric-label">↓ Download</div><div id="mDown" class="net-rate">—</div><div id="mDownTotal" class="metrics-muted">Gesamt: —</div></div><div class="net-card"><div class="metric-label">↑ Upload</div><div id="mUp" class="net-rate">—</div><div id="mUpTotal" class="metrics-muted">Gesamt: —</div></div></div><div class="metrics-muted">Gemessen über die System-Netzwerkzähler. Loopback wird nicht mitgezählt.</div></div><div class="metrics-muted">Aktualisierung alle 2 Sekunden · Werte sind Momentaufnahmen des Ubuntu-Systems.</div></div>`;
  document.body.appendChild(modal);
  const $ = id => document.getElementById(id);
  let previous = null;
  const fmtBytes = n => { if (!Number.isFinite(n)) return '—'; const u=['B/s','KB/s','MB/s','GB/s']; let i=0; while(n>=1000&&i<u.length-1){n/=1000;i++;} return `${n.toFixed(i?1:0)} ${u[i]}`; };
  const fmtGB = n => `${(n/1e9).toFixed(2)} GB`;
  function update(d){
    let cpu = previous ? 100 * (1 - (d.cpuIdle-previous.cpuIdle)/(d.cpuTotal-previous.cpuTotal || 1)) : 0; cpu=Math.max(0,Math.min(100,cpu));
    const ram=d.memoryTotal?100*d.memoryUsed/d.memoryTotal:0, disk=d.diskTotal?100*d.diskUsed/d.diskTotal:0;
    $('mCpu').textContent=`${cpu.toFixed(1)}%`; $('mCpuBar').style.width=`${cpu}%`; $('mLoad').textContent=`Load 1m: ${d.load1.toFixed(2)}`;
    $('mRam').textContent=`${ram.toFixed(1)}%`; $('mRamBar').style.width=`${ram}%`; $('mRamDetail').textContent=`${(d.memoryUsed/1e6).toFixed(0)} MB von ${(d.memoryTotal/1e6).toFixed(0)} MB`;
    $('mDisk').textContent=`${disk.toFixed(1)}%`; $('mDiskBar').style.width=`${disk}%`; $('mDiskDetail').textContent=`${(d.diskUsed/1e9).toFixed(1)} GB von ${(d.diskTotal/1e9).toFixed(1)} GB`;
    $('mCores').textContent=d.cpuCount;
    if(previous){const sec=Math.max(.1,(d.ts-previous.ts)/1000);$('mDown').textContent=fmtBytes((d.networkRx-previous.networkRx)/sec);$('mUp').textContent=fmtBytes((d.networkTx-previous.networkTx)/sec);}
    $('mDownTotal').textContent=`Gesamt: ${fmtGB(d.networkRx)}`; $('mUpTotal').textContent=`Gesamt: ${fmtGB(d.networkTx)}`; previous=d;
  }
  async function poll(){try{const r=await fetch('/metrics.json',{cache:'no-store'});if(r.ok)update(await r.json());}catch{}}
  document.querySelector('#metricsOpen')?.addEventListener('click',()=>{modal.classList.add('open');poll();});
  $('metricsClose').addEventListener('click',()=>modal.classList.remove('open'));
  modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open');});
  modal.querySelectorAll('.metrics-tab').forEach(btn=>btn.addEventListener('click',()=>{modal.querySelectorAll('.metrics-tab').forEach(x=>x.classList.remove('active'));btn.classList.add('active');const net=btn.dataset.tab==='network';$('metricsSystem').hidden=net;$('metricsNetwork').hidden=!net;}));
  setInterval(poll,2000); poll();
})();
