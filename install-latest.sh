#!/usr/bin/env bash
set -euo pipefail
REPO="https://github.com/jonascool19-pixel/radiobot"
VERSION="4.0.0"
APP="/opt/musikbot187"
DATA="/var/lib/musikbot187"
SERVICE_USER="musikbot187"
ENV_FILE="/etc/musikbot187.env"
ARCHIVE="/tmp/musikbot187-${VERSION}.tar.gz"
EXTRACT="/tmp/musikbot187-${VERSION}"
log(){ printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
fail(){ echo "FEHLER: $*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || exec sudo -E bash "$0" "$@"
command -v apt-get >/dev/null || fail 'Ubuntu/Debian mit apt-get erforderlich.'
[[ "$(ps -p 1 -o comm= 2>/dev/null || true)" == 'systemd' ]] || fail 'systemd muss PID 1 sein.'
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl ffmpeg python3 python3-venv build-essential g++ make gnupg openssl tar
NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then V="$(node --version)"; NODE_MAJOR="${V#v}"; NODE_MAJOR="${NODE_MAJOR%%.*}"; fi
if [[ "$NODE_MAJOR" -lt 22 ]]; then install -d -m 0755 /etc/apt/keyrings; curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg; echo 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main' >/etc/apt/sources.list.d/nodesource.list; apt-get update; apt-get install -y nodejs; fi
command -v node >/dev/null || fail 'Node.js fehlt.'
if ! command -v yt-dlp >/dev/null 2>&1; then python3 -m venv /opt/musikbot187-ytdlp; /opt/musikbot187-ytdlp/bin/pip install --upgrade pip yt-dlp; ln -sf /opt/musikbot187-ytdlp/bin/yt-dlp /usr/local/bin/yt-dlp; fi
command -v yt-dlp >/dev/null || fail 'yt-dlp fehlt.'
if ! id "$SERVICE_USER" >/dev/null 2>&1; then useradd --system --home /nonexistent --shell /usr/sbin/nologin "$SERVICE_USER"; fi
systemctl stop musikbot187.service 2>/dev/null || true
rm -rf "$APP" "$EXTRACT" "$ARCHIVE"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0750 "$APP" "$DATA" "$DATA/music"
log 'Quellarchiv laden'
curl -fsSL "${REPO}/archive/refs/heads/main.tar.gz" -o "$ARCHIVE"
tar -xzf "$ARCHIVE" -C /tmp
mv "/tmp/radiobot-main" "$EXTRACT"
cp -a "$EXTRACT/." "$APP/"
rm -rf "$EXTRACT" "$ARCHIVE"
cd "$APP/backend"
npm install --omit=dev --no-audit --no-fund
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP" "$DATA"
SETUP_TOKEN="$(openssl rand -hex 32)"
SESSION_SECRET="$(openssl rand -hex 32)"
cat > "$ENV_FILE" <<ENV
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
MUSIKBOT187_DATA_DIR=$DATA
MUSIKBOT187_SETUP_TOKEN=$SETUP_TOKEN
MUSIKBOT187_SESSION_SECRET=$SESSION_SECRET
ENV
chown root:"$SERVICE_USER" "$ENV_FILE"; chmod 0640 "$ENV_FILE"
cat > /etc/systemd/system/musikbot187.service <<UNIT
[Unit]
Description=MusikBot187 4.0.0
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
WorkingDirectory=$APP/backend
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node $APP/backend/src/server.js
User=$SERVICE_USER
Group=$SERVICE_USER
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelModules=true
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictRealtime=true
SystemCallArchitectures=native
CapabilityBoundingSet=
AmbientCapabilities=
ReadWritePaths=$DATA
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now musikbot187.service
sleep 2
if ! systemctl is-active --quiet musikbot187.service; then systemctl --no-pager -l status musikbot187.service || true; journalctl -u musikbot187.service -n 100 --no-pager || true; fail 'MusikBot187 konnte nicht gestartet werden.'; fi
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"; [[ -n "$IP" ]] || IP='SERVER-IP'
echo
echo '============================================================'
echo 'MusikBot187 4.0.0 installiert'
echo "Dashboard:        http://${IP}:3000/"
echo "Einrichtungslink: http://${IP}:3000/#setup=${SETUP_TOKEN}"
echo '============================================================'
echo 'Logs: journalctl -u musikbot187 -f'
