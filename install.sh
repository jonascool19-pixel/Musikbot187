#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo 'Bitte als root ausführen.'; exit 1; fi
APP_DIR=/opt/radiobot
DATA_DIR=/var/lib/radiobot
CONF_DIR=/etc/radiobot
TMP_DIR=$(mktemp -d)
REPO_TGZ=https://codeload.github.com/jonascool19-pixel/radiobot/tar.gz/refs/heads/main
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

if ! grep -q '^ID=ubuntu$' /etc/os-release || ! grep -q 'VERSION_ID="24.04"' /etc/os-release; then echo 'Dieses Installationsskript ist für Ubuntu 24.04 vorgesehen.'; exit 1; fi

echo '[1/9] Systempakete installieren...'
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl ffmpeg build-essential python3 tar gzip openssl unzip sudo

echo '[2/9] Node.js 24 prüfen...'
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then curl -fsSL https://deb.nodesource.com/setup_24.x | bash -; apt-get install -y nodejs; fi
node -v

echo '[3/9] yt-dlp und Deno installieren...'
install -d -m 0755 /usr/local/bin
curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod 0755 /usr/local/bin/yt-dlp
if ! command -v deno >/dev/null 2>&1; then
  DENO_INSTALL=/usr/local curl -fsSL https://deno.land/install.sh | sh
  if [[ -x /usr/local/bin/deno/deno ]]; then mv /usr/local/bin/deno/deno /usr/local/bin/deno.bin && rmdir /usr/local/bin/deno; fi
fi
if [[ -x /usr/local/bin/deno.bin ]]; then ln -sf /usr/local/bin/deno.bin /usr/local/bin/deno; fi
yt-dlp --version
deno --version | head -n1

echo '[4/9] Anwendung herunterladen...'
curl -fsSL "$REPO_TGZ" -o "$TMP_DIR/radiobot.tgz"
tar -xzf "$TMP_DIR/radiobot.tgz" -C "$TMP_DIR"
SRC_DIR=$(find "$TMP_DIR" -maxdepth 1 -type d -name 'radiobot-main-*' | head -n1)
[[ -n "$SRC_DIR" ]] || { echo 'Download fehlgeschlagen.'; exit 1; }
mkdir -p "$APP_DIR" "$DATA_DIR/music" "$CONF_DIR"
rm -rf "$APP_DIR/backend" "$APP_DIR/frontend"
cp -a "$SRC_DIR/backend" "$APP_DIR/"
cp -a "$SRC_DIR/frontend" "$APP_DIR/"
cp "$SRC_DIR/radiobot.service" "$APP_DIR/"
if ! id -u radiobot >/dev/null 2>&1; then useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin radiobot; fi
chown -R radiobot:radiobot "$APP_DIR" "$DATA_DIR"; chmod 700 "$DATA_DIR"
if [[ ! -f "$CONF_DIR/radiobot.env" ]]; then cat > "$CONF_DIR/radiobot.env" <<EOF
DISCORD_TOKEN=
PORT=3000
WEB_USER=admin
WEB_PASSWORD=$(openssl rand -hex 16)
DISCORD_CONTROL_ROLE=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://$(hostname -I | awk '{print $1}'):3000/api/spotify/callback
YTDLP_PATH=/usr/local/bin/yt-dlp
EOF
fi
chown root:root "$CONF_DIR/radiobot.env"; chmod 600 "$CONF_DIR/radiobot.env"

echo '[5/9] Backend bauen...'
cd "$APP_DIR/backend"
npm install --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund

echo '[6/9] Root-Updatehelfer einrichten...'
cat > /usr/local/sbin/radiobot-update <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
LOG=/var/lib/radiobot/update.status
printf 'started %s\n' "$(date -Is)" > "$LOG"
if curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install.sh | bash >> "$LOG" 2>&1; then
  printf 'finished %s success\n' "$(date -Is)" >> "$LOG"
else
  code=$?
  printf 'finished %s failed:%s\n' "$(date -Is)" "$code" >> "$LOG"
  exit "$code"
fi
EOF
chown root:root /usr/local/sbin/radiobot-update
chmod 0755 /usr/local/sbin/radiobot-update
cat > /etc/sudoers.d/radiobot-update <<'EOF'
radiobot ALL=(root) NOPASSWD: /usr/local/sbin/radiobot-update
EOF
chmod 0440 /etc/sudoers.d/radiobot-update
visudo -cf /etc/sudoers.d/radiobot-update >/dev/null

echo '[7/9] systemd-Dienst einrichten...'
install -m 0644 "$APP_DIR/radiobot.service" /etc/systemd/system/radiobot.service
systemctl daemon-reload
systemctl enable radiobot.service
cat > /usr/local/bin/radiobot <<'EOF'
#!/usr/bin/env bash
set -e
case "${1:-}" in
  start|stop|restart|status|enable|disable) exec systemctl "$1" radiobot ;;
  logs) exec journalctl -u radiobot -f ;;
  update) exec sudo -n /usr/local/sbin/radiobot-update ;;
  config) exec ${EDITOR:-nano} /etc/radiobot/radiobot.env ;;
  *) echo "Verwendung: radiobot {start|stop|restart|status|logs|update|config|enable|disable}"; exit 1 ;;
esac
EOF
chmod 755 /usr/local/bin/radiobot

echo '[8/9] Dienst starten...'
systemctl restart radiobot.service
sleep 2
systemctl --no-pager --full status radiobot.service || true

echo '[9/9] Fertig.'
IP=$(hostname -I | awk '{print $1}')
echo
echo "Dashboard: http://$IP:3000"
echo "Konfiguration: /etc/radiobot/radiobot.env"
echo "Musik:         /var/lib/radiobot/music"
echo "Status:        radiobot status"
echo "Logs:          radiobot logs"
echo
echo 'Discord-Token setzen: radiobot config && radiobot restart'
echo 'Status-Channel in Discord setzen: /statuschannel #dein-channel'
