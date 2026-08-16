#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte mit sudo/root ausführen.' >&2; exit 1; }

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y curl python3
BASE=$(mktemp)
trap 'rm -f "$BASE"' EXIT
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install.sh -o "$BASE"
chmod +x "$BASE"
bash "$BASE"

ROOT=/opt/radiobot
FRONT="$ROOT/frontend"
BACK="$ROOT/backend/src"

curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/frontend/dashboard-lock-fix.js -o "$FRONT/dashboard-lock-fix.js"

if ! grep -q 'dashboard-lock-fix.js' "$FRONT/index.html"; then
  python3 - <<'PY'
from pathlib import Path
p = Path('/opt/radiobot/frontend/index.html')
s = p.read_text()
s = s.replace('</body>', '<script src="/dashboard-lock-fix.js"></script></body>', 1)
p.write_text(s)
PY
fi

python3 - <<'PY'
from pathlib import Path

# Discord: make volume changes affect the active audio resource.
p = Path('/opt/radiobot/backend/src/discord.ts')
s = p.read_text()
if 'private currentResource?: any;' not in s:
    s = s.replace('  volume = 80;\n  connected = false;', '  volume = 80;\n  private currentResource?: any;\n  connected = false;', 1)
if 'setVolume(value: number)' not in s:
    marker = "  clearLogs() {\n    this.logs = [];\n    this.lastError = '';\n  }"
    replacement = marker + "\n\n  setVolume(value: number) {\n    this.volume = Math.max(0, Math.min(100, Number(value) || 0));\n    this.currentResource?.volume?.setVolume(this.volume / 100);\n  }"
    s = s.replace(marker, replacement, 1)
old_play = "this.player.play(createAudioResource(ff.stdout, { inputType: StreamType.Raw }));"
new_play = "const resource = createAudioResource(ff.stdout, { inputType: StreamType.Raw, inlineVolume: true });\n        resource.volume?.setVolume(this.volume / 100);\n        this.currentResource = resource;\n        this.player.play(resource);"
if old_play in s and 'this.currentResource = resource;' not in s:
    s = s.replace(old_play, new_play, 1)
old_cleanup = '      this.ffmpeg = undefined;\n      this.current = undefined;'
new_cleanup = '      this.ffmpeg = undefined;\n      this.currentResource = undefined;\n      this.current = undefined;'
if old_cleanup in s and 'this.currentResource = undefined;' not in s:
    s = s.replace(old_cleanup, new_cleanup, 1)
p.write_text(s)

# Backend: route live volume changes through the Discord resource.
p = Path('/opt/radiobot/backend/src/index.ts')
s = p.read_text()
old = "else if (action === 'volume') active.volume = Math.max(0, Math.min(100, Number((request.body ?? {}).value ?? 80)));"
new = "else if (action === 'volume') { const value = Math.max(0, Math.min(100, Number((request.body ?? {}).value ?? 80))); if (typeof active.setVolume === 'function') active.setVolume(value); else active.volume = value; }"
if old in s and "typeof active.setVolume === 'function'" not in s:
    s = s.replace(old, new, 1)
p.write_text(s)
PY

cd "$ROOT/backend"
npm install --include=dev --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund
systemctl restart radiobot
sleep 2
systemctl is-active --quiet radiobot
printf '\033[1;32mDashboard-Lock- und Lautstärke-Fix V2 installiert.\033[0m\n'
