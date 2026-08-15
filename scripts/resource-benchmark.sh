#!/usr/bin/env bash
set -euo pipefail

# Lightweight benchmark for a running RadioBot service.
# Usage: PID=123 ./scripts/resource-benchmark.sh [seconds]
# The benchmark is intentionally read-only: it never changes service limits.

DURATION="${1:-30}"
PID="${PID:-}"
INTERVAL="${INTERVAL:-1}"
OUT="${OUT:-resource-benchmark.csv}"

if [[ -z "$PID" ]]; then
  if command -v systemctl >/dev/null 2>&1; then
    PID="$(systemctl show -p MainPID --value radiobot.service 2>/dev/null || true)"
  fi
fi
[[ "$PID" =~ ^[0-9]+$ ]] && [[ "$PID" -gt 0 ]] || { echo "No running radiobot PID found. Set PID=..." >&2; exit 2; }
kill -0 "$PID" 2>/dev/null || { echo "PID $PID is not running" >&2; exit 2; }

CLK_TCK="$(getconf CLK_TCK)"
PAGE_SIZE="$(getconf PAGESIZE)"
HZ="$CLK_TCK"
start_ticks="$(awk '{print $22}' "/proc/$PID/stat")"
start_wall="$(date +%s.%N)"
start_cpu="$start_ticks"

printf 'timestamp,elapsed_s,rss_mb,vsz_mb,cpu_pct,threads,fd_count\n' > "$OUT"
peak_rss=0
peak_cpu=0
peak_vsz=0
samples=0

rss_bytes() { awk '/VmRSS:/ {print $2*1024}' "/proc/$PID/status"; }
vsz_bytes() { awk '/VmSize:/ {print $2*1024}' "/proc/$PID/status"; }
threads() { awk '/Threads:/ {print $2}' "/proc/$PID/status"; }
fd_count() { find "/proc/$PID/fd" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l; }

end_time=$(python3 - "$start_wall" "$DURATION" <<'PY'
import sys
print(float(sys.argv[1]) + float(sys.argv[2]))
PY
)

while kill -0 "$PID" 2>/dev/null; do
  now="$(date +%s.%N)"
  elapsed="$(python3 - "$start_wall" "$now" <<'PY'
import sys
print(max(0.0,float(sys.argv[2])-float(sys.argv[1])))
PY
)"
  [[ "$(python3 - "$elapsed" "$DURATION" <<'PY'
import sys
print(float(sys.argv[1]) <= float(sys.argv[2]))
PY
)" == "True" ]] || break

  stat_line="$(cat "/proc/$PID/stat")"
  utime="$(awk '{print $14}' <<<"$stat_line")"
  stime="$(awk '{print $15}' <<<"$stat_line")"
  total_cpu="$((utime + stime))"
  cpu_pct="$(python3 - "$total_cpu" "$start_cpu" "$HZ" "$elapsed" <<'PY'
import sys
cur,base,hz,elapsed=map(float,sys.argv[1:])
print(0.0 if elapsed<=0 else max(0.0,(cur-base)/hz/elapsed*100.0))
PY
)"
  rss="$(rss_bytes)"; vsz="$(vsz_bytes)"; th="$(threads)"; fds="$(fd_count)"
  rss_mb="$(python3 - "$rss" <<'PY'
import sys
print(float(sys.argv[1])/1024/1024)
PY
)"
  vsz_mb="$(python3 - "$vsz" <<'PY'
import sys
print(float(sys.argv[1])/1024/1024)
PY
)"
  printf '%s,%s,%s,%s,%s,%s,%s\n' "$(date -Iseconds)" "$elapsed" "$rss_mb" "$vsz_mb" "$cpu_pct" "$th" "$fds" >> "$OUT"
  peak_rss="$(python3 - "$peak_rss" "$rss_mb" <<'PY'
import sys
print(max(float(sys.argv[1]),float(sys.argv[2])))
PY
)"
  peak_vsz="$(python3 - "$peak_vsz" "$vsz_mb" <<'PY'
import sys
print(max(float(sys.argv[1]),float(sys.argv[2])))
PY
)"
  peak_cpu="$(python3 - "$peak_cpu" "$cpu_pct" <<'PY'
import sys
print(max(float(sys.argv[1]),float(sys.argv[2])))
PY
)"
  samples=$((samples+1))
  sleep "$INTERVAL"
done

python3 - "$OUT" "$peak_rss" "$peak_vsz" "$peak_cpu" "$samples" <<'PY'
import csv,sys,statistics
path,peak_rss,peak_vsz,peak_cpu,samples=sys.argv[1:]
with open(path,newline='') as f: rows=list(csv.DictReader(f))
rss=[float(r['rss_mb']) for r in rows]
cpu=[float(r['cpu_pct']) for r in rows]
print('=== RadioBot resource benchmark ===')
print(f'samples: {samples}')
if rows:
    print(f'RSS avg: {statistics.mean(rss):.1f} MB')
    print(f'RSS peak: {float(peak_rss):.1f} MB')
    print(f'RSS p95: {sorted(rss)[max(0,int(len(rss)*.95)-1)]:.1f} MB')
    print(f'CPU avg: {statistics.mean(cpu):.1f}%')
    print(f'CPU peak: {float(peak_cpu):.1f}%')
    print(f'VSZ peak: {float(peak_vsz):.1f} MB')
    print(f'raw samples: {path}')
    # Conservative sizing guidance for the process itself, not a promise for external child processes.
    p=float(peak_rss)
    print(f'estimated RAM: minimum >= {p*1.35:.0f} MB, recommended >= {p*1.75:.0f} MB, comfortable >= {p*2.25:.0f} MB')
PY
