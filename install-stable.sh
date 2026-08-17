#!/usr/bin/env bash
set -euo pipefail
REPO="https://github.com/jonascool19-pixel/radiobot.git"
APP="/opt/musikbot187"
DATA="/var/lib/musikbot187"

if [[ $EUID -ne 0 ]]; then SUDO=sudo; else SUDO=""; fi
if ! command -v apt-get >/dev/null 2>&1; then
  echo "Unterstützt werden derzeit Debian/Ubuntu-Systeme mit apt-get."
  exit 1
fi

$SUDO apt-get update
$SUDO apt-get upgrade -y
$SUDO apt-get install -y curl git ffmpeg ca-certificates

if ! command -v node >/dev/null 2>&1 || (( $(node -p 'Number(process.versions.node.split(".")[0])') < 22 )); then
  curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash -
  $SUDO apt-get install -y nodejs
fi

$SUDO rm -rf "$APP"
$SUDO install -d "$DATA/music" /usr/local/sbin
$SUDO git clone --depth 1 "$REPO" "$APP"

cd "$APP/backend"
npm install --omit=dev --no-audit --no-fund

$SUDO install -m 0755 install/control.sh /usr/local/sbin/musikbot187-control

cat >/tmp/musikbot187.env <<ENV
MUSIKBOT187_DATA_DIR=$DATA
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
ENV
$SUDO install -m 0640 /tmp/musikbot187.env /etc/musikbot187.env

cat >/tmp/musikbot187.service <<UNIT
[Unit]
Description=MusikBot187
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP/backend
EnvironmentFile=/etc/musikbot187.env
ExecStart=/usr/bin/node $APP/backend/src/server.js
Restart=on-failure
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
UNIT

$SUDO install -m 0644 /tmp/musikbot187.service /etc/systemd/system/musikbot187.service
$SUDO systemctl daemon-reload
$SUDO systemctl enable --now musikbot187

if command -v systemctl >/dev/null 2>&1; then
  $SUDO systemctl --no-pager --full status musikbot187 || true
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
printf '\nMusikBot187 läuft: http://%s:3000/\n' "${IP:-SERVER-IP}"
