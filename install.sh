#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo 'Bitte als root ausführen, z.B. curl ... | sudo bash'; exit 1; fi
APP_DIR=/opt/radiobot
DATA_DIR=/var/lib/radiobot
CONF_DIR=/etc/radiobot
TMP_DIR=$(mktemp -d)
REPO_TGZ=https://codeload.github.com/jonascool19-pixel/radiobot/tar.gz/refs/heads/main
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

if ! grep -q '^ID=ubuntu$' /etc/os-release || ! grep -q 'VERSION_ID="24.04"' /etc/os-release; then
  echo 'Dieses Installationsskript ist für Ubuntu 24.04 vorgesehen.'
  exit 1
fi

echo '[1/8] Systempakete installieren...'
apt-get update
apt-get install -y ca-certificates curl ffmpeg build-essential python3 tar gzip

echo '[2/8] Node.js 24 LTS installieren/aktualisieren...'
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

echo '[3/8] Anwendung herunterladen...'
curl -fsSL "$REPO_TGZ" -o "$TMP_DIR/radiobot.tgz"
tar -xzf "$TMP_DIR/radiobot.tgz" -C "$TMP_DIR"
SRC_DIR=$(find "$TMP_DIR" -maxdepth 1 -type d -name 'radiobot-main-*' | head -n1)
[[ -n "$SRC_DIR" ]] || { echo 'Download fehlgeschlagen.'; exit 1; }

mkdir -p "$APP_DIR" "$DATA_DIR/music" "$CONF_DIR"
# Konfiguration und Daten bleiben bei Updates erhalten.
if [[ -f "$APP_DIR/.env" && ! -f "$CONF_DIR/radiobot.env" ]]; then cp "$APP_DIR/.env" "$CONF_DIR/radiobot.env"; fi
cp -a "$SRC_DIR/backend" "$APP_DIR/"
cp -a "$SRC_DIR/frontend" "$APP_DIR/"
cp "$SRC_DIR/package.json" "$APP_DIR/" 2>/dev/null || true
cp "$SRC_DIR/radiobot.service" "$APP_DIR/"

if ! id -u radiobot >/dev/null 2>&1; then useradd --system --home-dir /var/lib/radiobot --shell /usr/sbin/nologin radiobot; fi
chown -R radiobot:radiobot "$APP_DIR" "$DATA_DIR"
chmod 700 "$DATA_DIR"

if [[ ! -f "$CONF_DIR/radiobot.env" ]]; then
  cat > "$CONF_DIR/radiobot.env" <<EOF
DISCORD_TOKEN=
PORT=3000
WEB_USER=admin
WEB_PASSWORD=$(openssl rand -hex 16 2>/dev/null || echo CHANGE_ME)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://$(hostname -I | awk '{print $1}'):3000/api/spotify/callback
EOF
  chmod 600 "$CONF_DIR/radiobot.env"
fi
chown root:root "$CONF_DIR/radiobot.env"; chmod 600 "$CONF_DIR/radiobot.env"

cat > "$APP_DIR/package.json" <<'EOF'
{"private":true,"workspaces":["backend"]}
EOF

echo '[4/8] Node-Abhängigkeiten installieren...'
cd "$APP_DIR/backend"
npm install

echo '[5/8] Backend kompilieren...'
npm run build

if [[ -f "$APP_DIR/.env.example" ]]; then :; fi

echo '[6/8] systemd-Dienst einrichten...'
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

echo '[7/8] Dienst starten...'
systemctl restart radiobot.service
sleep 2
systemctl --no-pager --full status radiobot.service || true

echo '[8/8] Fertig.'
IP=$(hostname -I | awk '{print $1}')
echo
 echo "Dashboard: http://$IP:3000"
echo "Konfiguration: /etc/radiobot/radiobot.env"
echo "Musik:         /var/lib/radiobot/music"
echo "Status:        radiobot status"
echo "Logs:          radiobot logs"
echo
 echo 'Discord-Token und ggf. Spotify-Zugangsdaten in /etc/radiobot/radiobot.env setzen und danach: radiobot restart'
