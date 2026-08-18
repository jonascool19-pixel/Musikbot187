#!/usr/bin/env bash
set -euo pipefail
REPO="https://github.com/jonascool19-pixel/radiobot.git"
REF="${MUSIKBOT187_REF:-main}"
APP="/opt/musikbot187"
DATA="/var/lib/musikbot187"
SERVICE_USER="musikbot187"
YTDLP_VERSION="${MUSIKBOT187_YTDLP_VERSION:-2026.07.04}"
YTDLP_SHA256="${MUSIKBOT187_YTDLP_SHA256:-6bbb3d314cde4febe36e5fa1d55462e29c974f63444e707871834f6d8cc210ae}"
YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_linux"

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_CYAN=$'\033[36m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_BLUE=$'\033[34m'; C_WHITE=$'\033[37m'; C_GREEN_BG=$'\033[42m'
else
  C_RESET= C_BOLD= C_CYAN= C_GREEN= C_YELLOW= C_RED= C_BLUE= C_WHITE= C_GREEN_BG=
fi
log_step() { printf '%s▶ %s%s\n' "$C_CYAN$C_BOLD" "$1" "$C_RESET"; }
log_ok() { printf '%s✔ %s%s\n' "$C_GREEN$C_BOLD" "$1" "$C_RESET"; }
log_warn() { printf '%s⚠ %s%s\n' "$C_YELLOW$C_BOLD" "$1" "$C_RESET"; }
log_error() { printf '%s✖ %s%s\n' "$C_RED$C_BOLD" "$1" "$C_RESET" >&2; }
printf '\n%s%sMusikBot187 Installer%s\n' "$C_BLUE" "$C_BOLD" "$C_RESET"
printf '%s────────────────────────────────────────%s\n\n' "$C_CYAN" "$C_RESET"
if [[ $EUID -ne 0 ]]; then SUDO=sudo; else SUDO=""; fi
if ! command -v apt-get >/dev/null 2>&1; then log_error "Unterstützt werden derzeit Debian/Ubuntu-Systeme mit apt-get."; exit 1; fi
if [[ "$(ps -p 1 -o comm= 2>/dev/null || true)" != "systemd" ]]; then log_error "MusikBot187 benötigt systemd als PID 1. Bei einem Proxmox-CT bitte einen Ubuntu 24.04 CT mit systemd verwenden."; exit 1; fi
if [[ ! -d /sys/fs/cgroup ]]; then log_error "cgroups sind nicht verfügbar. Der Proxmox-CT muss cgroups/systemd zulassen."; exit 1; fi
log_step "Systempakete aktualisieren"; $SUDO apt-get update; $SUDO apt-get install -y curl git ffmpeg ca-certificates python3 sudo gpg; log_ok "Systempakete bereit"
if ! command -v node >/dev/null 2>&1 || (( $(node -p 'Number(process.versions.node.split(".")[0])') < 22 )); then
  log_step "Node.js 22 installieren"; $SUDO install -d -m 0755 /etc/apt/keyrings; curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | $SUDO gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg; echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | $SUDO tee /etc/apt/sources.list.d/nodesource.list >/dev/null; $SUDO apt-get update; $SUDO apt-get install -y nodejs; log_ok "Node.js $(node --version) installiert"
else log_ok "Vorhandenes Node.js $(node --version) verwendet"; fi
log_step "yt-dlp ${YTDLP_VERSION} installieren und SHA-256 prüfen"; TMP_YTDLP="$(mktemp)"; trap 'rm -f "$TMP_YTDLP"' EXIT; curl -fL "$YTDLP_URL" -o "$TMP_YTDLP"; echo "${YTDLP_SHA256}  ${TMP_YTDLP}" | sha256sum -c -; $SUDO install -o root -g root -m 0755 "$TMP_YTDLP" /usr/local/bin/yt-dlp; command -v yt-dlp >/dev/null; command -v ffmpeg >/dev/null; command -v node >/dev/null; log_ok "yt-dlp und FFmpeg bereit"
log_step "MusikBot187-Dienst vorbereiten"; SETUP_TOKEN="$(node -e 'const {randomBytes}=require("node:crypto");process.stdout.write(randomBytes(32).toString("hex"))')"; $SUDO systemctl stop musikbot187.service 2>/dev/null || true; $SUDO systemctl stop musikbot187-control.service 2>/dev/null || true; $SUDO rm -rf "$APP"; if ! $SUDO getent passwd "$SERVICE_USER" >/dev/null; then $SUDO useradd --system --home /nonexistent --shell /usr/sbin/nologin "$SERVICE_USER"; fi; $SUDO install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_USER" "$DATA" "$DATA/music"; $SUDO install -d -m 0755 /usr/local/sbin
log_step "Repository-Stand ${REF} holen"; $SUDO git init "$APP"; $SUDO git -C "$APP" remote add origin "$REPO"; $SUDO git -C "$APP" fetch --depth 1 origin "$REF"; $SUDO git -C "$APP" checkout --detach FETCH_HEAD
cd "$APP/backend"; log_step "Produktionsabhängigkeiten installieren"; $SUDO npm install --omit=dev --no-audit --no-fund; $SUDO chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP"; log_ok "MusikBot187-Code installiert"
cat >/tmp/musikbot187.env <<ENV
MUSIKBOT187_DATA_DIR=$DATA
MUSIKBOT187_SETUP_TOKEN=$SETUP_TOKEN
MUSIKBOT187_CONTROL_SOCKET=/run/musikbot187/control.sock
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
ENV
$SUDO install -o root -g "$SERVICE_USER" -m 0640 /tmp/musikbot187.env /etc/musikbot187.env; rm -f /tmp/musikbot187.env
SERVICE_UID="$($SUDO id -u "$SERVICE_USER")"; SERVICE_GID="$($SUDO id -g "$SERVICE_USER")"
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
$SUDO install -o root -g root -m 0644 /tmp/musikbot187-control.service /etc/systemd/system/musikbot187-control.service; rm -f /tmp/musikbot187-control.service
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
$SUDO install -o root -g root -m 0644 /tmp/musikbot187.service /etc/systemd/system/musikbot187.service; rm -f /tmp/musikbot187.service; $SUDO systemctl daemon-reload; $SUDO systemctl enable --now musikbot187-control.service; $SUDO systemctl enable --now musikbot187.service
if $SUDO systemctl is-active --quiet musikbot187; then log_ok "MusikBot187-Dienst läuft"; else log_error "MusikBot187 konnte nicht gestartet werden."; $SUDO systemctl --no-pager --full status musikbot187 || true; exit 1; fi
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"; BASE_URL="http://${IP:-SERVER-IP}:3000"
printf '\n%s%s╔════════════════════════════════════════════════════════════════════╗%s\n' "$C_GREEN_BG" "$C_RED$C_BOLD" "$C_RESET"
printf '%s%s║  MUSIKBOT187 ERFOLGREICH INSTALLIERT                            ║%s\n' "$C_GREEN_BG" "$C_RED$C_BOLD" "$C_RESET"
printf '%s%s║                                                                  ║%s\n' "$C_GREEN_BG" "$C_RED$C_BOLD" "$C_RESET"
printf '%s%s║  Bot läuft:       %-48s║%s\n' "$C_GREEN_BG" "$C_RED$C_BOLD" "$BASE_URL" "$C_RESET"
printf '%s%s║  Einrichtungslink: %-45s║%s\n' "$C_GREEN_BG" "$C_RED$C_BOLD" "$BASE_URL/#setup=$SETUP_TOKEN" "$C_RESET"
printf '%s%s║                                                                  ║%s\n' "$C_GREEN_BG" "$C_RED$C_BOLD" "$C_RESET"
printf '%s%s║  Öffne den Einrichtungslink jetzt im Browser.                   ║%s\n' "$C_GREEN_BG" "$C_RED$C_BOLD" "$C_RESET"
printf '%s%s╚════════════════════════════════════════════════════════════════════╝%s\n\n' "$C_GREEN_BG" "$C_RED$C_BOLD" "$C_RESET"
