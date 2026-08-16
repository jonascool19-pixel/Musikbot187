#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte als root/sudo ausführen.' >&2; exit 1; }
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y curl python3
BASE=$(mktemp)
trap 'rm -f "$BASE"' EXIT
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install.sh -o "$BASE"
chmod +x "$BASE"
bash "$BASE"

APP=/opt/radiobot
python3 - "$APP" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1])
backend = root / 'backend/src'
frontend = root / 'frontend'

# Make play resilient to an empty/stale activeInstance.
index = backend / 'index.ts'
s = index.read_text()
old = "function bot(id = config.activeInstance): any { return discord.get(id) ?? ts3.get(id); }"
new = "function bot(id = config.activeInstance): any { return (id && (discord.get(id) ?? ts3.get(id))) || [...discord.values()].find((x: any) => x?.connected) || [...ts3.values()].find((x: any) => x?.connected) || discord.values().next().value || ts3.values().next().value; }"
if old in s:
    s = s.replace(old, new)
index.write_text(s)

# Ensure the safe dashboard patch is loaded exactly once.
html = frontend / 'index.html'
h = html.read_text()
tag = '<script src="/dashboard-safe-fix.js"></script>'
if tag not in h:
    h = h.replace('</body>', tag + '</body>')
html.write_text(h)
PY

cd "$APP/backend"
npm install --include=dev --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund
systemctl restart radiobot
systemctl restart radiobot-network
sleep 2
systemctl is-active --quiet radiobot
systemctl is-active --quiet radiobot-network
printf '\033[1;32mDashboard-Safe-Fix installiert.\033[0m\n'
