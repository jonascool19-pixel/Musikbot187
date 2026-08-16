#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte mit sudo/root ausführen.' >&2; exit 1; }

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y curl
BASE="$(mktemp)"
trap 'rm -f "$BASE"' EXIT
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install.sh -o "$BASE"
chmod +x "$BASE"
bash "$BASE"

APP=/opt/radiobot
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/frontend/dashboard-v3-fix.js -o "$APP/frontend/dashboard-v3-fix.js"
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/scripts/network-telemetry-persistent.sh -o "$APP/scripts/network-telemetry-persistent.sh"
chmod 0755 "$APP/scripts/network-telemetry-persistent.sh"
chown radiobot:radiobot "$APP/frontend/dashboard-v3-fix.js" "$APP/scripts/network-telemetry-persistent.sh"

cat > /etc/systemd/system/radiobot-network.service <<'EOF'
[Unit]
Description=RadioBot persistent network telemetry
After=network-online.target radiobot.service
Wants=network-online.target

[Service]
Type=simple
User=radiobot
Group=radiobot
ExecStart=/opt/radiobot/scripts/network-telemetry-persistent.sh
Restart=always
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/radiobot/frontend /var/lib/radiobot

[Install]
WantedBy=multi-user.target
EOF

python3 - <<'PY'
from pathlib import Path
idx = Path('/opt/radiobot/frontend/index.html')
tag = '<script src="/dashboard-v3-fix.js"></script>'
text = idx.read_text()
if tag not in text:
    text = text.replace('</body>', tag + '</body>')
    idx.write_text(text)
PY

chown -R radiobot:radiobot /opt/radiobot/frontend /opt/radiobot/scripts
systemctl daemon-reload
systemctl enable radiobot-network.service
systemctl restart radiobot.service
systemctl restart radiobot-network.service
sleep 3
systemctl is-active --quiet radiobot.service
systemctl is-active --quiet radiobot-network.service
printf '\033[1;32mDashboard-V3-Fix installiert.\033[0m\n'
