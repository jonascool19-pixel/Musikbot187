#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte mit sudo/root ausführen.' >&2; exit 1; }
BASE="$(mktemp)"
trap 'rm -f "$BASE"' EXIT
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-dashboard-v2.sh -o "$BASE"
chmod +x "$BASE"
bash "$BASE"

python3 - <<'PY'
from pathlib import Path

telemetry = Path('/opt/radiobot/scripts/network-telemetry.sh')
telemetry.write_text(r'''#!/usr/bin/env bash
set -euo pipefail
OUT=/opt/radiobot/frontend/network.json
STATE=/var/lib/radiobot/network-total.json
mkdir -p "$(dirname "$OUT")" "$(dirname "$STATE")"

read_totals() {
  awk -F'[: ]+' '/^[[:space:]]*[^:]+:/{iface=$1; if(iface!="lo"){rx+=$2; tx+=$10}} END{printf "%s %s\n", rx+0, tx+0}' /proc/net/dev
}

prev_rx=0
prev_tx=0
prev_at=0

total_rx=0
total_tx=0
if [[ -s "$STATE" ]]; then
  read -r total_rx total_tx < <(python3 - <<'PY2'
import json
from pathlib import Path
p=Path('/var/lib/radiobot/network-total.json')
try:
    d=json.loads(p.read_text())
    print(int(d.get('rxTotal',0)), int(d.get('txTotal',0)))
except Exception:
    print(0,0)
PY2
  ) || true
fi

while :; do
  now=$(date +%s)
  read -r rx tx < <(read_totals)
  rx_rate=0
  tx_rate=0
  delta_rx=0
  delta_tx=0
  if [[ "$prev_at" -gt 0 && "$now" -gt "$prev_at" ]]; then
    seconds=$((now-prev_at))
    delta_rx=$((rx-prev_rx))
    delta_tx=$((tx-prev_tx))
    ((delta_rx < 0)) && delta_rx=0
    ((delta_tx < 0)) && delta_tx=0
    rx_rate=$(( delta_rx / seconds ))
    tx_rate=$(( delta_tx / seconds ))
  fi
  total_rx=$((total_rx + delta_rx))
  total_tx=$((total_tx + delta_tx))
  total=$((total_rx + total_tx))
  printf '{"rx":%s,"tx":%s,"rxTotal":%s,"txTotal":%s,"total":%s,"at":%s}\n' "$rx_rate" "$tx_rate" "$total_rx" "$total_tx" "$total" "$now" > "$OUT.tmp"
  mv "$OUT.tmp" "$OUT"
  printf '{"rxTotal":%s,"txTotal":%s,"total":%s,"updatedAt":%s}\n' "$total_rx" "$total_tx" "$total" "$now" > "$STATE.tmp"
  mv "$STATE.tmp" "$STATE"
  chown radiobot:radiobot "$STATE" "$OUT" 2>/dev/null || true
  chmod 0640 "$STATE" "$OUT" 2>/dev/null || true
  prev_rx=$rx
  prev_tx=$tx
  prev_at=$now
  sleep 2
done
''')
telemetry.chmod(0o755)

js = Path('/opt/radiobot/frontend/network-total.js')
js.write_text(r'''(() => {
  const fmt = bytes => {
    let n = Number(bytes) || 0;
    const units = ['B','KB','MB','GB','TB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
  };
  async function refresh() {
    try {
      const r = await fetch(`/network.json?ts=${Date.now()}`, {cache:'no-store'});
      if (!r.ok) return;
      const d = await r.json();
      const view = document.getElementById('settingsView');
      if (!view) return;
      const status = view.querySelector('.status-layout');
      if (!status) return;
      let card = view.querySelector('#networkTotalCard');
      if (!card) {
        card = document.createElement('div');
        card.id = 'networkTotalCard';
        card.className = 'page-panel network-total-card';
        card.innerHTML = `<div class="page-head"><div><h2>Netzwerkverbrauch</h2><p class="muted">Seit Installation bzw. Zählerstart.</p></div></div><div class="panel details network-total-details"><div><span>Gesamt</span><b data-net-total>—</b></div><div><span>Download</span><b data-net-rx>—</b></div><div><span>Upload</span><b data-net-tx>—</b></div></div>`;
        status.appendChild(card);
      }
      card.querySelector('[data-net-total]').textContent = fmt(d.total);
      card.querySelector('[data-net-rx]').textContent = fmt(d.rxTotal);
      card.querySelector('[data-net-tx]').textContent = fmt(d.txTotal);
    } catch {}
  }
  const observer = new MutationObserver(refresh);
  observer.observe(document.body, {childList:true, subtree:true});
  refresh();
  setInterval(refresh, 2000);
})();
''')

idx = Path('/opt/radiobot/frontend/index.html')
html = idx.read_text()
tag = '<script src="/network-total.js"></script>'
if tag not in html:
    html = html.replace('</body>', tag + '</body>')
    idx.write_text(html)

style = Path('/opt/radiobot/frontend/network-total.css')
style.write_text(r'''.network-total-card{margin-top:16px}.network-total-details{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.network-total-details>div{display:flex;flex-direction:column;gap:4px}@media(max-width:800px){.network-total-details{grid-template-columns:1fr}}
''')
html = idx.read_text()
tag_css = '<link rel="stylesheet" href="/network-total.css">'
if tag_css not in html:
    html = html.replace('</head>', tag_css + '</head>')
    idx.write_text(html)
PY

systemctl restart radiobot-network.service
systemctl restart radiobot.service
sleep 2
systemctl is-active --quiet radiobot-network.service
systemctl is-active --quiet radiobot.service
printf '\033[1;32mNetzwerk-Gesamtverbrauch installiert.\033[0m\n'
