#!/usr/bin/env bash
set -euo pipefail
REPO="https://github.com/jonascool19-pixel/radiobot.git"
REF="${MUSIKBOT187_REF:-827f558e2549c061057eb0d3e0039f62faa91a17}"
APP="/opt/musikbot187"
DATA="/var/lib/musikbot187"
SERVICE_USER="musikbot187"
YTDLP_VERSION="${MUSIKBOT187_YTDLP_VERSION:-2026.07.04}"
YTDLP_SHA256="${MUSIKBOT187_YTDLP_SHA256:-6bbb3d314cde4febe36e5fa1d55462e29c974f63444e707871834f6d8cc210ae}"
YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_linux"

if [[ $EUID -ne 0 ]]; then SUDO=sudo; else SUDO=""; fi
if ! command -v apt-get >/dev/null 2>&1; then echo "Unterstützt werden derzeit Debian/Ubuntu-Systeme mit apt-get."; exit 1; fi
if [[ "$(ps -p 1 -o comm= 2>/dev/null || true)" != "systemd" ]]; then echo "Fehler: MusikBot187 benötigt systemd als PID 1. Bei einem Proxmox-CT bitte einen Ubuntu 24.04 CT mit systemd verwenden." >&2; exit 1; fi
if [[ ! -d /sys/fs/cgroup ]]; then echo "Fehler: cgroups sind nicht verfügbar. Der Proxmox-CT muss cgroups/systemd zulassen." >&2; exit 1; fi

$SUDO apt-get update
$SUDO apt-get install -y curl git ffmpeg ca-certificates python3 sudo gpg

if ! command -v node >/dev/null 2>&1 || (( $(node -p 'Number(process.versions.node.split(".")[0])') < 22 )); then
  $SUDO install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | $SUDO gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | $SUDO tee /etc/apt/sources.list.d/nodesource.list >/dev/null
  $SUDO apt-get update
  $SUDO apt-get install -y nodejs
fi

TMP_YTDLP="$(mktemp)"
trap 'rm -f "$TMP_YTDLP"' EXIT
curl -fL "$YTDLP_URL" -o "$TMP_YTDLP"
echo "${YTDLP_SHA256}  ${TMP_YTDLP}" | sha256sum -c -
$SUDO install -o root -g root -m 0755 "$TMP_YTDLP" /usr/local/bin/yt-dlp
command -v yt-dlp >/dev/null
command -v ffmpeg >/dev/null
command -v node >/dev/null

SETUP_TOKEN="$(node -e 'const {randomBytes}=require("node:crypto");process.stdout.write(randomBytes(32).toString("hex"))')"
$SUDO systemctl stop musikbot187.service 2>/dev/null || true
$SUDO systemctl stop musikbot187-control.service 2>/dev/null || true
$SUDO rm -rf "$APP"
if ! $SUDO getent passwd "$SERVICE_USER" >/dev/null; then $SUDO useradd --system --home /nonexistent --shell /usr/sbin/nologin "$SERVICE_USER"; fi
$SUDO install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_USER" "$DATA" "$DATA/music"
$SUDO install -d -m 0755 /usr/local/sbin

$SUDO git init "$APP"
$SUDO git -C "$APP" remote add origin "$REPO"
$SUDO git -C "$APP" fetch --depth 1 origin "$REF"
$SUDO git -C "$APP" checkout --detach FETCH_HEAD
cd "$APP/backend"
$SUDO npm install --omit=dev --no-audit --no-fund
$SUDO chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP"

cat >/tmp/musikbot187.env <<ENV
MUSIKBOT187_DATA_DIR=$DATA
MUSIKBOT187_SETUP_TOKEN=$SETUP_TOKEN
MUSIKBOT187_CONTROL_SOCKET=/run/musikbot187/control.sock
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
ENV
$SUDO install -o root -g "$SERVICE_USER" -m 0640 /tmp/musikbot187.env /etc/musikbot187.env
rm -f /tmp/musikbot187.env

SERVICE_UID="$($SUDO id -u "$SERVICE_USER")"
SERVICE_GID="$($SUDO id -g "$SERVICE_USER")"

cat >/tmp/musikbot187-control.service <<UNIT
[Unit]
Description=MusikBot187 privileged control helper
Before=musikbot187.service

[Service]
Type=simple
ExecStart=/usr/bin/node $APP/install/control-daemon.js
Environment=MUSIKBOT187_CONTROL_SOCKET=/run/musikbot187/control.sock
Environment=MUSIKBOT187_UID=$SERVICE_UID
Environment=MUSIKBOT187_GID=$SERVICE_GID
Restart=always
RestartSec=2
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
RuntimeDirectory=musikbot187
RuntimeDirectoryMode=0750

[Install]
WantedBy=multi-user.target
UNIT
$SUDO install -o root -g root -m 0644 /tmp/musikbot187-control.service /etc/systemd/system/musikbot187-control.service
rm -f /tmp/musikbot187-control.service

cat >/tmp/musikbot187.service <<UNIT
[Unit]
Description=MusikBot187
After=network-online.target musikbot187-control.service
Wants=network-online.target
Requires=musikbot187-control.service

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
$SUDO install -o root -g root -m 0644 /tmp/musikbot187.service /etc/systemd/system/musikbot187.service
rm -f /tmp/musikbot187.service
$SUDO systemctl daemon-reload
$SUDO systemctl enable --now musikbot187-control.service
$SUDO systemctl enable --now musikbot187.service

if $SUDO systemctl is-active --quiet musikbot187; then echo "MusikBot187 wurde erfolgreich gestartet."; else echo "MusikBot187 konnte nicht gestartet werden." >&2; $SUDO systemctl --no-pager --full status musikbot187 || true; exit 1; fi
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
BASE_URL="http://${IP:-SERVER-IP}:3000"
printf '\nMusikBot187 läuft: %s/\n' "$BASE_URL"
printf 'Einrichtungslink: %s/#setup=%s\n' "$BASE_URL" "$SETUP_TOKEN"
