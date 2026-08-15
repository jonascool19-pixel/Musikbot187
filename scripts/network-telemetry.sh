#!/usr/bin/env bash
set -euo pipefail
OUT=/opt/radiobot/frontend/network.json
mkdir -p "$(dirname "$OUT")"
prev_rx=0
prev_tx=0
prev_at=0

read_totals() {
  awk -F'[: ]+' '/^[[:space:]]*[^:]+:/{iface=$1; if(iface!="lo"){rx+=$2; tx+=$10}} END{printf "%s %s\n", rx+0, tx+0}' /proc/net/dev
}

while :; do
  now=$(date +%s)
  read -r rx tx < <(read_totals)
  rx_rate=0
  tx_rate=0
  if [[ "$prev_at" -gt 0 && "$now" -gt "$prev_at" ]]; then
    seconds=$((now-prev_at))
    rx_rate=$(( (rx-prev_rx) / seconds ))
    tx_rate=$(( (tx-prev_tx) / seconds ))
    ((rx_rate < 0)) && rx_rate=0
    ((tx_rate < 0)) && tx_rate=0
  fi
  printf '{"rx":%s,"tx":%s,"rxTotal":%s,"txTotal":%s,"at":%s}\n' "$rx_rate" "$tx_rate" "$rx" "$tx" "$now" > "$OUT.tmp"
  mv "$OUT.tmp" "$OUT"
  prev_rx=$rx
  prev_tx=$tx
  prev_at=$now
  sleep 2
done
