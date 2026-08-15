#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo 'Bitte als root ausführen.'; exit 1; fi
APP_DIR=/opt/radiobot
DATA_DIR=/var/lib/radiobot
CONF_DIR=/etc/radiobot
ROOT_BIN_DIR=/usr/local/libexec/radiobot
RELEASE_REF=v2.1.0
REPO_TGZ=https://codeload.github.com/jonascool19-pixel/radiobot/tar.gz/refs/heads/$RELEASE_REF
TMP_DIR=$(mktemp -d)
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

if ! grep -q '^ID=ubuntu$' /etc/os-release || ! grep -q 'VERSION_ID="24.04"' /etc/os-release; then echo 'Dieses Installationsskript ist für Ubuntu 24.04 vorgesehen.'; exit 1; fi

echo '[1/10] Systempakete installieren...'
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl ffmpeg build-essential python3 tar gzip openssl unzip sudo

echo '[2/10] Node.js 24 prüfen...'
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then curl -fsSL https://deb.nodesource.com/setup_24.x | bash -; apt-get install -y nodejs; fi
node -v

echo '[3/10] yt-dlp und Deno installieren...'
install -d -m 0755 /usr/local/bin
curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod 0755 /usr/local/bin/yt-dlp

# Deno is needed by yt-dlp for some YouTube extraction paths. Install it in a
# system location and export the PATH immediately so the *current* installer
# shell can use it; do not rely on reloading .bashrc/.profile.
if ! command -v deno >/dev/null 2>&1; then
  DENO_INSTALL=/usr/local
  export DENO_INSTALL
  echo 'Deno wird systemweit installiert...'
  curl -fsSL https://deno.land/install.sh | sh
fi

# Older/current Deno installers may still place the binary under the invoking
# user's home directory. Normalize either layout to /usr/local/bin/deno.
if [[ -x /usr/local/bin/deno/deno ]]; then
  mv /usr/local/bin/deno/deno /usr/local/bin/deno.bin
  rmdir /usr/local/bin/deno
fi
if [[ -x /usr/local/bin/deno.bin ]]; then
  ln -sfn /usr/local/bin/deno.bin /usr/local/bin/deno
elif [[ -x "$DENO_INSTALL/bin/deno" ]]; then
  ln -sfn "$DENO_INSTALL/bin/deno" /usr/local/bin/deno
elif [[ -x "$HOME/.deno/bin/deno" ]]; then
  ln -sfn "$HOME/.deno/bin/deno" /usr/local/bin/deno
fi

export PATH="/usr/local/bin:${DENO_INSTALL:-/usr/local}/bin:${HOME}/.deno/bin:${PATH}"
hash -r

if ! command -v deno >/dev/null 2>&1; then
  echo 'Deno konnte nicht eingerichtet werden.' >&2
  echo "PATH: $PATH" >&2
  echo 'Prüfen Sie /usr/local/bin/deno und ~/.deno/bin/deno.' >&2
  exit 1
fi

test -x "$(command -v deno)"
yt-dlp --version
deno --version | head -n1

echo '[4/10] Anwendung herunterladen...'
curl -fsSL "$REPO_TGZ" -o "$TMP_DIR/radiobot.tgz"
tar -xzf "$TMP_DIR/radiobot.tgz" -C "$TMP_DIR"
SRC_DIR=$(find "$TMP_DIR" -maxdepth 1 -type d -name 'radiobot-*' | head -n1)
[[ -n "$SRC_DIR" ]] || { echo 'Download fehlgeschlagen.'; exit 1; }
mkdir -p "$APP_DIR" "$DATA_DIR/music" "$CONF_DIR" "$ROOT_BIN_DIR"
rm -rf "$APP_DIR/backend" "$APP_DIR/frontend" "$APP_DIR/patches" "$APP_DIR/scripts"
cp -a "$SRC_DIR/backend" "$APP_DIR/"
cp -a "$SRC_DIR/frontend" "$APP_DIR/"
cp -a "$SRC_DIR/patches" "$APP_DIR/"
cp -a "$SRC_DIR/scripts" "$APP_DIR/"
cp "$SRC_DIR/radiobot.service" "$APP_DIR/"
cp "$SRC_DIR/musikbot187-metrics.service" "$APP_DIR/"
cp "$SRC_DIR/musikbot187-metrics.timer" "$APP_DIR/"
cp "$SRC_DIR/radiobot-privileged.service" "$APP_DIR/"
python3 "$APP_DIR/patches/enable-radio-features.py"
python3 "$APP_DIR/patches/fix-radio-feature-patch.py"
python3 "$APP_DIR/patches/setup-wizard.py"
python3 "$APP_DIR/patches/ui-builder.py"
python3 "$APP_DIR/patches/ui-builder-pointer.py"
python3 "$APP_DIR/patches/final-hardening.py"
python3 "$APP_DIR/patches/security-final.py"
python3 "$APP_DIR/patches/final-setup-routes.py"
if ! grep -q "app.get('/api/setup/status'" "$APP_DIR/backend/src/index.ts"; then echo 'Ersteinrichtung konnte nicht in das Backend integriert werden.'; exit 1; fi
if ! grep -q 'radio-enhancements.js' "$APP_DIR/frontend/index.html"; then sed -i 's#<script src="/app.js"></script>#<script src="/app.js"></script><script src="/radio-enhancements.js"></script>#' "$APP_DIR/frontend/index.html"; fi
if ! grep -q 'metrics-panel.js' "$APP_DIR/frontend/index.html"; then sed -i 's#<script src="/app.js"></script>#<script src="/app.js"></script><script src="/metrics-panel.js"></script>#' "$APP_DIR/frontend/index.html"; fi
if ! grep -q 'setup-wizard.js' "$APP_DIR/frontend/index.html"; then sed -i 's#<script src="/app.js"></script>#<script src="/app.js"></script><script src="/setup-wizard.js"></script>#' "$APP_DIR/frontend/index.html"; fi
if ! grep -q 'system-controls.js' "$APP_DIR/frontend/index.html"; then sed -i 's#</body>#<script src="/system-controls.js"></script></body>#' "$APP_DIR/frontend/index.html"; fi
if ! id -u radiobot >/dev/null 2>&1; then useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin radiobot; fi
chown -R radiobot:radiobot "$APP_DIR" "$DATA_DIR"; chmod 700 "$DATA_DIR"
install -m 0755 -o root -g root "$APP_DIR/scripts/radiobot-privileged.py" "$ROOT_BIN_DIR/radiobot-privileged.py"
install -m 0644 -o root -g root "$APP_DIR/radiobot-privileged.service" /etc/systemd/system/radiobot-privileged.service
chmod 0755 "$ROOT_BIN_DIR"; chown root:root "$ROOT_BIN_DIR"
rm -f "$APP_DIR/scripts/radiobot-privileged.py"

if [[ ! -f "$CONF_DIR/radiobot.env" ]]; then
  SETUP_TOKEN=$(openssl rand -hex 24)
  cat > "$CONF_DIR/radiobot.env" <<EOF
DISCORD_TOKEN=
PORT=3000
WEB_USER=admin
WEB_PASSWORD=$(openssl rand -hex 16)
DISCORD_CONTROL_ROLE=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=
YOUTUBE_API_KEY=
YTDLP_PATH=/usr/local/bin/yt-dlp
SETUP_TOKEN=$SETUP_TOKEN
EOF
else
  if ! grep -q '^SETUP_TOKEN=' "$CONF_DIR/radiobot.env"; then echo "SETUP_TOKEN=" >> "$CONF_DIR/radiobot.env"; fi
fi
chown root:root "$CONF_DIR/radiobot.env"; chmod 600 "$CONF_DIR/radiobot.env"

echo '[5/10] Backend bauen...'
cd "$APP_DIR/backend"
npm install --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund

echo '[6/10] Root-Konfigurations- und Updatehelfer einrichten...'
cat > /usr/local/sbin/radiobot-configure <<'PYEOF'
#!/usr/bin/env python3
import json, shlex, subprocess, tempfile
from pathlib import Path
CONF=Path('/etc/radiobot/radiobot.env')
allowed={'DISCORD_TOKEN','WEB_USER','WEB_PASSWORD','PORT','DISCORD_CONTROL_ROLE','SPOTIFY_CLIENT_ID','SPOTIFY_CLIENT_SECRET','SPOTIFY_REDIRECT_URI','YOUTUBE_API_KEY','YTDLP_PATH','SETUP_TOKEN'}
raw=json.load(__import__('sys').stdin)
if not isinstance(raw,dict): raise SystemExit('invalid configuration')
current={}
if CONF.exists():
    for line in CONF.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k,v=line.split('=',1); current[k]=v.strip().strip('"').strip("'")
for key in allowed:
    if key in raw and raw[key] is not None:
        value=str(raw[key])
        if '\n' in value or '\r' in value: raise SystemExit(f'invalid value for {key}')
        if key in {'WEB_PASSWORD','SPOTIFY_CLIENT_SECRET','YOUTUBE_API_KEY','DISCORD_TOKEN'} and value == '' and current.get(key): continue
        current[key]=value
if not current.get('DISCORD_TOKEN'): raise SystemExit('DISCORD_TOKEN is required')
if len(current.get('WEB_PASSWORD','')) < 12: raise SystemExit('WEB_PASSWORD must contain at least 12 characters')
port=int(current.get('PORT','3000'))
if not 1 <= port <= 65535: raise SystemExit('invalid PORT')
current['PORT']=str(port)
if raw.get('publicUrl') and not current.get('SPOTIFY_REDIRECT_URI'): current['SPOTIFY_REDIRECT_URI']=str(raw['publicUrl']).rstrip('/')+'/api/spotify/callback'
lines=[f"{k}={shlex.quote(str(current.get(k,'')))}" for k in ['DISCORD_TOKEN','PORT','WEB_USER','WEB_PASSWORD','DISCORD_CONTROL_ROLE','SPOTIFY_CLIENT_ID','SPOTIFY_CLIENT_SECRET','SPOTIFY_REDIRECT_URI','YOUTUBE_API_KEY','YTDLP_PATH','SETUP_TOKEN']]
CONF.parent.mkdir(mode=0o700,exist_ok=True)
fd,tmp=tempfile.mkstemp(dir=CONF.parent,prefix='.radiobot.env.',text=True)
import os
os.fchmod(fd,0o600); os.write(fd, ('\n'.join(lines)+'\n').encode()); os.close(fd); os.replace(tmp,CONF); os.chown(CONF,0,0)
subprocess.run(['systemctl','restart','radiobot.service'],check=False)
PYEOF
chmod 0755 /usr/local/sbin/radiobot-configure
chown root:root /usr/local/sbin/radiobot-configure
python3 "$APP_DIR/patches/configure-helper-hardening.py"
cat > /usr/local/sbin/radiobot-update <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec 9>/run/lock/radiobot-update.lock
flock -n 9 || { echo 'Update läuft bereits.' >&2; exit 1; }
LOG=/var/lib/radiobot/update.status
RELEASE_REF=v2.1.0
REPO_TGZ="https://codeload.github.com/jonascool19-pixel/radiobot/tar.gz/refs/heads/${RELEASE_REF}"
printf 'started %s release=%s\n' "$(date -Is)" "$RELEASE_REF" > "$LOG"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$REPO_TGZ" -o "$TMP/radiobot.tgz"
tar -xzf "$TMP/radiobot.tgz" -C "$TMP"
SRC=$(find "$TMP" -maxdepth 1 -type d -name 'radiobot-*' | head -n1)
[[ -n "$SRC" ]] || { echo 'Pinned release archive invalid.' >&2; exit 1; }
grep -q '^RELEASE_REF=v2.1.0$' "$SRC/install.sh" || { echo 'Pinned release mismatch.' >&2; exit 1; }
if bash "$SRC/install.sh" >> "$LOG" 2>&1; then printf 'finished %s success release=%s\n' "$(date -Is)" "$RELEASE_REF" >> "$LOG"; else code=$?; printf 'finished %s failed:%s release=%s\n' "$(date -Is)" "$code" "$RELEASE_REF" >> "$LOG"; exit "$code"; fi
EOF
chown root:root /usr/local/sbin/radiobot-update /usr/local/sbin/radiobot-configure
chmod 0755 /usr/local/sbin/radiobot-update
rm -f /etc/sudoers.d/radiobot-update

cat > /usr/local/bin/radiobot <<'EOF'
#!/usr/bin/env bash
set -e
case "${1:-}" in
  start|stop|restart|status|enable|disable) exec systemctl "$1" radiobot ;;
  logs) exec journalctl -u radiobot -f ;;
  update) exec python3 -c 'import socket; s=socket.create_connection("/run/radiobot-privileged.sock",2); s.sendall(b"bot-update\n"); print(s.recv(128).decode().strip())' ;;
  config) echo 'Konfiguration bitte über das Webinterface öffnen.'; exit 0 ;;
  *) echo "Verwendung: radiobot {start|stop|restart|status|logs|update|config|enable|disable}"; exit 1 ;;
esac
EOF
chmod 755 /usr/local/bin/radiobot

echo '[7/10] systemd-Dienste einrichten...'
install -m 0644 "$APP_DIR/radiobot.service" /etc/systemd/system/radiobot.service
install -m 0644 "$APP_DIR/musikbot187-metrics.service" /etc/systemd/system/musikbot187-metrics.service
install -m 0644 "$APP_DIR/musikbot187-metrics.timer" /etc/systemd/system/musikbot187-metrics.timer
install -m 0644 "$APP_DIR/radiobot-privileged.service" /etc/systemd/system/radiobot-privileged.service
chmod 0755 "$APP_DIR/scripts/system-metrics.py"
python3 "$APP_DIR/scripts/system-metrics.py"
systemctl daemon-reload
systemctl enable --now radiobot-privileged.service
systemctl enable radiobot.service
systemctl enable --now musikbot187-metrics.timer
cat > /usr/local/libexec/radiobot/README <<'EOF'
This directory contains root-owned lifecycle helpers. Do not make it writable by the radiobot service user.
EOF
chmod 0444 /usr/local/libexec/radiobot/README

echo '[8/10] Dienst starten...'
systemctl restart radiobot.service
sleep 2
systemctl --no-pager --full status radiobot.service || true

echo '[9/10] Metriken prüfen...'
python3 "$APP_DIR/scripts/system-metrics.py"
test -s "$DATA_DIR/metrics.json"
python3 -m json.tool "$DATA_DIR/metrics.json" >/dev/null
systemctl is-enabled musikbot187-metrics.timer >/dev/null
systemctl is-enabled radiobot-privileged.service >/dev/null

echo '[10/10] MusikBot187 fertig.'
IP=$(hostname -I | awk '{print $1}')
SETUP=$(grep '^SETUP_TOKEN=' "$CONF_DIR/radiobot.env" | cut -d= -f2- || true)
echo
echo "Dashboard: http://$IP:3000"
if [[ -n "$SETUP" ]]; then echo "Ersteinrichtung: http://$IP:3000/#setup=$SETUP"; fi
echo "Konfiguration: /etc/radiobot/radiobot.env"
echo "Musik:         /var/lib/radiobot/music"
echo "Status:        radiobot status"
echo "Logs:          radiobot logs"
echo
echo 'Discord-Token, Spotify, YouTube, Web-Passwort und weitere Einstellungen werden nach der Installation im Webinterface eingerichtet.'
echo 'Laufzeit-Ressource: 500 MB bis 1 GB RAM empfohlen; 768 MB ist der Zielwert.'
echo 'Radio: Im Dashboard im Bereich Radio nach Sendern suchen und in die Radio-Playlist speichern.'
echo 'Leistung: Im Dashboard auf Leistung klicken; Netzwerk zeigt Upload/Download und Gesamtvolumen.'
