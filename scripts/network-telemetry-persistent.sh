#!/usr/bin/env bash
set -euo pipefail
OUT=/opt/radiobot/frontend/network.json
STATE=/var/lib/radiobot/network-usage.json
mkdir -p "$(dirname "$OUT")" "$(dirname "$STATE")"

read_totals() {
  awk -F'[: ]+' '/^[[:space:]]*[^:]+:/{iface=$1; if(iface!="lo"){rx+=$2; tx+=$10}} END{printf "%s %s\n", rx+0, tx+0}' /proc/net/dev
}

last_rx=0
last_tx=0
persist_rx=0
persist_tx=0
if [[ -f "$STATE" ]]; then
  read -r persist_rx persist_tx < <(python3 - <<'PY'
import json
try:
    d=json.load(open('/var/lib/radiobot/network-usage.json'))
    print(int(d.get('rxTotal',0)), int(d.get('txTotal',0)))
except Exception:
    print(0,0)
PY
  )
fi

while :; do
  now=$(date +%s)
  read -r rx tx < <(read_totals)
  if [[ "$last_rx" -gt 0 ]]; then
    drx=$((rx-last_rx)); dtx=$((tx-last_tx))
    ((drx < 0)) && drx=$rx
    ((dtx < 0)) && dtx=$tx
    persist_rx=$((persist_rx+drx))
    persist_tx=$((persist_tx+dtx))
  fi
  persist=$(printf '{"rxTotal":%s,"txTotal":%s,"at":%s}\n' "$persist_rx" "$persist_tx" "$now")
  printf '%s' "$persist" > "$STATE.tmp"
  mv "$STATE.tmp" "$STATE"
  rx_rate=0; tx_rate=0
  if [[ "$last_rx" -gt 0 ]]; then
    rx_rate=$((drx/2)); tx_rate=$((dtx/2))
    ((rx_rate < 0)) && rx_rate=0
    ((tx_rate < 0)) && tx_rate=0
  fi
  printf '{"rx":%s,"tx":%s,"rxTotal":%s,"txTotal":%s,"at":%s}\n' "$rx_rate" "$tx_rate" "$persist_rx" "$persist_tx" "$now" > "$OUT.tmp"
  mv "$OUT.tmp" "$OUT"
  last_rx=$rx; last_tx=$tx
  sleep 2
done
