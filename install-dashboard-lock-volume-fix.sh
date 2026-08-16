#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte mit sudo/root ausführen.' >&2; exit 1; }

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y curl perl
BASE=$(mktemp)
trap 'rm -f "$BASE"' EXIT
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install.sh -o "$BASE"
chmod +x "$BASE"
bash "$BASE"

ROOT=/opt/radiobot
FRONT=$ROOT/frontend
BACK=$ROOT/backend/src

curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/frontend/dashboard-lock-fix.js -o "$FRONT/dashboard-lock-fix.js"

if ! grep -q 'dashboard-lock-fix.js' "$FRONT/index.html"; then
  perl -0pi -e 's#</body>#<script src="/dashboard-lock-fix.js"></script></body>#' "$FRONT/index.html"
fi

DISCORD="$BACK/discord.ts"
INDEX="$BACK/index.ts"

perl -0pi -e 's/  volume = 80;\n  connected = false;/  volume = 80;\n  private currentResource?: any;\n  connected = false;/' "$DISCORD"

perl -0pi -e 's/  clearLogs\(\) \{\n    this\.logs = \[\];\n    this\.lastError = \'\';\n  \}/  clearLogs() {\n    this.logs = [];\n    this.lastError = \'\';\n  }\n\n  setVolume(value: number) {\n    this.volume = Math.max(0, Math.min(100, Number(value) || 0));\n    this.currentResource?.volume?.setVolume(this.volume \/ 100);\n  }/' "$DISCORD"

perl -0pi -e 's/this\.player\.play\(createAudioResource\(ff\.stdout, \{ inputType: StreamType\.Raw \}\)\);/const resource = createAudioResource(ff.stdout, { inputType: StreamType.Raw, inlineVolume: true });\n        resource.volume?.setVolume(this.volume \/ 100);\n        this.currentResource = resource;\n        this.player.play(resource);/' "$DISCORD"

perl -0pi -e 's/      this\.ffmpeg = undefined;\n      this\.current = undefined;/      this.ffmpeg = undefined;\n      this.currentResource = undefined;\n      this.current = undefined;/' "$DISCORD"

perl -0pi -e 's/else if \(action === \'volume\'\) active\.volume = Math\.max\(0, Math\.min\(100, Number\(\(request\.body \?\? \{\}\)\.value \?\? 80\)\)\);/else if (action === \'volume\') { const value = Math.max(0, Math.min(100, Number((request.body ?? {}).value ?? 80))); if (typeof active.setVolume === \'function\') active.setVolume(value); else active.volume = value; }/' "$INDEX"

cd "$ROOT/backend"
npm install --include=dev --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund
systemctl restart radiobot
sleep 2
systemctl is-active --quiet radiobot
printf '\033[1;32mDashboard-Lock- und Lautstärke-Fix installiert.\033[0m\n'
