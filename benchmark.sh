#!/usr/bin/env bash
set -euo pipefail
printf 'Musikbot 187 resource benchmark\n'; for i in 1 2 3; do /usr/bin/time -f 'elapsed=%e rss=%MKB' node -e 'const os=require("os");console.log({cpu:os.cpus().length,ram:os.totalmem()})'; done
