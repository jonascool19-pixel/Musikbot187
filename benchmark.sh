#!/usr/bin/env bash
set -euo pipefail
printf 'Musikbot 187 resource benchmark\n'
printf 'Node: '; node -v
printf 'Deno: '; deno --version | head -n1 || true
printf 'FFmpeg: '; ffmpeg -version | head -n1
printf 'yt-dlp: '; yt-dlp --version
printf 'CPU cores: '; nproc
printf 'Memory: '; free -h | awk '/Mem:/ {print $2}'
printf 'Disk /opt: '; df -h /opt | awk 'NR==2 {print $4 " free"}'
time -p sh -c 'cd backend && npm run build >/dev/null'
printf 'Build benchmark: OK\n'
