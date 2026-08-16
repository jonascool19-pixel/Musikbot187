#!/usr/bin/env bash
set -euo pipefail
printf 'RadioBot benchmark\n'
printf 'Node: '; node -v
printf 'Deno: '; deno --version | head -1
printf 'yt-dlp: '; yt-dlp --version
printf 'FFmpeg: '; ffmpeg -version | head -1
printf 'CPU cores: '; nproc
printf 'Memory: '; free -h | awk '/Mem:/{print $2}'
for i in 1 2 3; do curl -fsS http://127.0.0.1:3000/api/health || true; echo; sleep .2; done