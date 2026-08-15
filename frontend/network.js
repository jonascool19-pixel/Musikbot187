function netFormat(bytes) {
  const n = Number(bytes) || 0;
  const units = ['B','KB','MB','GB'];
  let value = n, i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(i ? 1 : 0)} ${units[i]}/s`;
}

async function refreshNetworkTelemetry() {
  try {
    const response = await fetch(`/network.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    const top = document.getElementById('topNet');
    if (top) top.textContent = `NET ↓ ${netFormat(data.rx)} ↑ ${netFormat(data.tx)}`;
    document.querySelectorAll('.system-mini').forEach(el => {
      el.innerHTML = `<span>NET ↓ ${netFormat(data.rx)}</span><span>↑ ${netFormat(data.tx)}</span>`;
    });
  } catch {}
}

refreshNetworkTelemetry();
setInterval(refreshNetworkTelemetry, 2000);
