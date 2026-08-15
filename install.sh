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

echo '[1/7] Schlanke Systempakete installieren...'
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl ffmpeg build-essential python3 tar gzip openssl

echo '[2/7] Node.js 24 LTS prüfen...'
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then curl -fsSL https://deb.nodesource.com/setup_24.x | bash -; apt-get install -y nodejs; fi
node -v

echo '[3/7] Anwendung herunterladen...'
curl -fsSL "$REPO_TGZ" -o "$TMP_DIR/radiobot.tgz"
tar -xzf "$TMP_DIR/radiobot.tgz" -C "$TMP_DIR"
SRC_DIR=$(find "$TMP_DIR" -maxdepth 1 -type d -name 'radiobot-main-*' | head -n1)
[[ -n "$SRC_DIR" ]] || { echo 'Download fehlgeschlagen.'; exit 1; }
mkdir -p "$APP_DIR" "$DATA_DIR/music" "$CONF_DIR"
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
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://$(hostname -I | awk '{print $1}'):3000/api/spotify/callback
YOUTUBE_API_KEY=
EOF
else
  grep -q '^YOUTUBE_API_KEY=' "$CONF_DIR/radiobot.env" || echo 'YOUTUBE_API_KEY=' >> "$CONF_DIR/radiobot.env"
fi
chown root:root "$CONF_DIR/radiobot.env"; chmod 600 "$CONF_DIR/radiobot.env"

echo '[4/7] Dependencies schlank installieren...'
cd "$APP_DIR/backend"
npm install --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund

echo '[5/7] Dienst einrichten...'
install -m 0644 "$APP_DIR/radiobot.service" /etc/systemd/system/radiobot.service
systemctl daemon-reload
systemctl enable radiobot.service
cat > /usr/local/bin/radiobot <<'EOF'
#!/usr/bin/env bash
set -e
case "${1:-}" in
  start|stop|restart|status|enable|disable) exec systemctl "$1" radiobot ;;
  logs) exec journalctl -u radiobot -f ;;
  update) exec bash -c 'curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install.sh | bash' ;;
  config) exec ${EDITOR:-nano} /etc/radiobot/radiobot.env ;;
  *) echo "Verwendung: radiobot {start|stop|restart|status|logs|update|config|enable|disable}"; exit 1 ;;
esac
EOF
chmod 755 /usr/local/bin/radiobot

echo '[6/7] Dienst starten...'
systemctl restart radiobot.service
sleep 2
systemctl --no-pager --full status radiobot.service || true

echo '[7/7] Fertig.'
IP=$(hostname -I | awk '{print $1}')
echo
echo "Dashboard: http://$IP:3000"
echo "Konfiguration: /etc/radiobot/radiobot.env"
echo "Musik:         /var/lib/radiobot/music"
echo "Status:        radiobot status"
echo "Logs:          radiobot logs"
echo
echo 'Discord-Token, optional Spotify-Zugangsdaten und optional YOUTUBE_API_KEY setzen: radiobot config && radiobot restart'
echo 'Installationsphase: bis zu 1 GB RAM einplanen. Laufzeitprofil: 1 vCPU, 90% CPU und maximal 480 MB RAM.'
