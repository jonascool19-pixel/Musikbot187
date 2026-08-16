#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte mit sudo/root ausführen.' >&2; exit 1; }

BASE="$(mktemp)"
trap 'rm -f "$BASE"' EXIT

curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-network-total.sh -o "$BASE"
chmod +x "$BASE"
bash "$BASE"

python3 - <<'PY'
from pathlib import Path
p = Path('/opt/radiobot/backend/src/discord.ts')
s = p.read_text()
old = """      await this.ensureVoice();
      const ff = await spawnPcm(item.input, this.volume);
"""
new = """      if (!this.connection || this.connection.state.status !== VoiceConnectionStatus.Ready) {
        await this.ensureVoice();
      } else {
        this.connection.subscribe(this.player);
      }
      const ff = await spawnPcm(item.input, this.volume);
"""
if old not in s:
    raise SystemExit('Playback voice-connection patch target not found')
s = s.replace(old, new, 1)
p.write_text(s)
PY

cd /opt/radiobot/backend
npm install --include=dev --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund
systemctl restart radiobot
sleep 2
systemctl is-active --quiet radiobot
printf '\033[1;32mFFmpeg-/Voice-Pipe-Fix installiert.\033[0m\n'
