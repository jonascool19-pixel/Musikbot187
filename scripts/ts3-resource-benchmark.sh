#!/usr/bin/env bash
set -euo pipefail

DURATION="${DURATION:-10}"
OUT="${OUT:-ts3-resource-benchmark.csv}"
DATA_DIR="${DATA_DIR:-/tmp/radiobot-ts3-benchmark}"
mkdir -p "$DATA_DIR"
rm -f "$OUT"

printf 'timestamp,elapsed_s,rss_mb,cpu_pct,threads,fd_count\n' > "$OUT"
TS3_BENCHMARK_ONLY=1 DATA_DIR="$DATA_DIR" node backend/dist/ts3-bot.js > /tmp/radiobot-ts3-benchmark.log 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true; rm -rf "$DATA_DIR"' EXIT

start=$(date +%s.%N)
peak_rss=0
peak_cpu=0
samples=0

while kill -0 "$PID" 2>/dev/null; do
  now=$(date +%s.%N)
  elapsed=$(python3 - "$start" "$now" <<'PY'
import sys
print(float(sys.argv[2])-float(sys.argv[1]))
PY
)
  if ! python3 - "$elapsed" "$DURATION" <<'PY'
import sys
raise SystemExit(0 if float(sys.argv[1]) <= float(sys.argv[2]) else 1)
PY
  then break; fi
  rss_kb=$(ps -o rss= -p "$PID" | tr -d ' ')
  cpu=$(ps -o %cpu= -p "$PID" | tr -d ' ')
  threads=$(awk '/Threads:/ {print $2}' "/proc/$PID/status" 2>/dev/null || echo 0)
  fds=$(find "/proc/$PID/fd" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l)
  rss_mb=$(python3 - "$rss_kb" <<'PY'
import sys
print(float(sys.argv[1])/1024)
PY
)
  printf '%s,%s,%s,%s,%s,%s\n' "$(date -Iseconds)" "$elapsed" "$rss_mb" "${cpu:-0}" "${threads:-0}" "${fds:-0}" >> "$OUT"
  peak_rss=$(python3 - "$peak_rss" "$rss_mb" <<'PY'
import sys
print(max(float(sys.argv[1]),float(sys.argv[2])))
PY
)
  peak_cpu=$(python3 - "$peak_cpu" "${cpu:-0}" <<'PY'
import sys
print(max(float(sys.argv[1]),float(sys.argv[2])))
PY
)
  samples=$((samples+1))
  sleep 0.25
done

wait "$PID" 2>/dev/null || true
if [[ $samples -eq 0 ]]; then
  cat /tmp/radiobot-ts3-benchmark.log >&2 || true
  exit 1
fi

python3 - "$OUT" "$peak_rss" "$peak_cpu" "$samples" <<'PY'
import csv, statistics, sys
path, peak_rss, peak_cpu, samples = sys.argv[1:]
rows=list(csv.DictReader(open(path,newline='')))
rss=[float(r['rss_mb']) for r in rows]
cpu=[float(r['cpu_pct']) for r in rows]
print('=== TeamSpeak 3 component benchmark (offline) ===')
print(f'samples: {samples}')
print(f'RSS avg: {statistics.mean(rss):.1f} MB')
print(f'RSS peak: {float(peak_rss):.1f} MB')
print(f'RSS p95: {sorted(rss)[max(0,int(len(rss)*.95)-1)]:.1f} MB')
print(f'CPU avg: {statistics.mean(cpu):.1f}%')
print(f'CPU peak: {float(peak_cpu):.1f}%')
print(f'raw samples: {path}')
PY
