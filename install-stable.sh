#!/usr/bin/env bash
set -euo pipefail
REPO="https://github.com/jonascool19-pixel/radiobot.git"
APP="/opt/musikbot187"
DATA="/var/lib/musikbot187"
SERVICE_USER="musikbot187"

if [[ $EUID -ne 0 ]]; then SUDO=sudo; else SUDO=""; fi
if ! command -v apt-get >/dev/null 2>&1; then echo "Unterstützt werden derzeit Debian/Ubuntu-Systeme mit apt-get."; exit 1; fi
if [[ "$(ps -p 1 -o comm= 2>/dev/null || true)" != "systemd" ]]; then echo "Fehler: MusikBot187 benötigt systemd als PID 1. Bei einem Proxmox-CT bitte einen Ubuntu 24.04 CT mit systemd verwenden." >&2; exit 1; fi
if [[ ! -d /sys/fs/cgroup ]]; then echo "Fehler: cgroups sind nicht verfügbar. Der Proxmox-CT muss cgroups/systemd zulassen." >&2; exit 1; fi

$SUDO apt-get update
$SUDO apt-get install -y curl git ffmpeg ca-certificates python3 sudo

if ! command -v node >/dev/null 2>&1 || (( $(node -p 'Number(process.versions.node.split(".")[0])') < 22 )); then
  if [[ -n "$SUDO" ]]; then curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -; else curl -fsSL https://deb.nodesource.com/setup_22.x | bash; fi
  $SUDO apt-get install -y nodejs
fi

$SUDO curl -fL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
$SUDO chmod 0755 /usr/local/bin/yt-dlp
command -v yt-dlp >/dev/null
command -v ffmpeg >/dev/null
command -v node >/dev/null

SETUP_TOKEN="$(node -e 'const {randomBytes}=require("node:crypto");process.stdout.write(randomBytes(32).toString("hex"))')"
$SUDO systemctl stop musikbot187.service 2>/dev/null || true
$SUDO rm -rf "$APP"
if ! $SUDO getent passwd "$SERVICE_USER" >/dev/null; then $SUDO useradd --system --home /nonexistent --shell /usr/sbin/nologin "$SERVICE_USER"; fi
$SUDO install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_USER" "$DATA" "$DATA/music"
$SUDO install -d -m 0755 /usr/local/sbin

$SUDO git clone --depth 1 "$REPO" "$APP"
cd "$APP/backend"
$SUDO npm install --omit=dev --no-audit --no-fund
$SUDO chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP"
$SUDO install -o root -g root -m 0755 "$APP/install/control.sh" /usr/local/sbin/musikbot187-control

cat >/tmp/musikbot187.env <<ENV
MUSIKBOT187_DATA_DIR=$DATA
MUSIKBOT187_SETUP_TOKEN=$SETUP_TOKEN
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
ENV
$SUDO install -o root -g "$SERVICE_USER" -m 0640 /tmp/musikbot187.env /etc/musikbot187.env
rm -f /tmp/musikbot187.env

cat >/tmp/musikbot187.sudoers <<SUDOERS
Cmnd_Alias MUSIKBOT187_CONTROL = /usr/bin/systemctl start musikbot187, /usr/bin/systemctl restart musikbot187, /usr/bin/systemctl stop musikbot187, /usr/bin/systemctl reboot, /usr/bin/systemctl poweroff
$SERVICE_USER ALL=(root) NOPASSWD: MUSIKBOT187_CONTROL
SUDOERS
$SUDO install -o root -g root -m 0440 /tmp/musikbot187.sudoers /etc/sudoers.d/musikbot187
rm -f /tmp/musikbot187.sudoers
$SUDO visudo -cf /etc/sudoers.d/musikbot187

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
User=$SERVICE_USER
Group=$SERVICE_USER
UMask=0077
NoNewPrivileges=false
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
ReadWritePaths=$DATA

[Install]
WantedBy=multi-user.target
UNIT
$SUDO install -o root -g root -m 0644 /tmp/musikbot187.service /etc/systemd/system/musikbot187.service
rm -f /tmp/musikbot187.service
$SUDO systemctl daemon-reload
$SUDO systemctl enable --now musikbot187

if $SUDO systemctl is-active --quiet musikbot187; then echo "MusikBot187 wurde erfolgreich gestartet."; else echo "MusikBot187 konnte nicht gestartet werden." >&2; $SUDO systemctl --no-pager --full status musikbot187 || true; exit 1; fi
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
BASE_URL="http://${IP:-SERVER-IP}:3000"
printf '\nMusikBot187 läuft: %s/\n' "$BASE_URL"
printf 'Einrichtungslink: %s/#setup=%s\n' "$BASE_URL" "$SETUP_TOKEN"
