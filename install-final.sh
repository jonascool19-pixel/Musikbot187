#!/usr/bin/env bash
set -euo pipefail
PINNED_COMMIT="6aa0a6bd594782bb9f4529bd7f1f0496de59a172"
REPO="jonascool19-pixel/radiobot"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
[[ $EUID -eq 0 ]] || { echo 'Bitte als root ausführen.' >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo 'curl fehlt. Bitte apt-get update && apt-get install -y curl ausführen.' >&2; exit 1; }
curl -fsSL "https://raw.githubusercontent.com/${REPO}/${PINNED_COMMIT}/install.sh" -o "$TMP_DIR/install.sh"
sed -i "s/^RELEASE_REF=v2\.1\.0$/RELEASE_REF=${PINNED_COMMIT}/" "$TMP_DIR/install.sh"
sed -i 's#refs/heads/\$RELEASE_REF#\$RELEASE_REF#' "$TMP_DIR/install.sh"
grep -q "^RELEASE_REF=${PINNED_COMMIT}$" "$TMP_DIR/install.sh"
python3 - "$TMP_DIR/install.sh" <<'PY'
from pathlib import Path
p = Path(__import__('sys').argv[1])
s = p.read_text()
s = s.replace('https://deno.land/install.sh | sh\n', 'https://deno.land/install.sh | sh -s -- -y\n')
p.write_text(s)
PY
bash "$TMP_DIR/install.sh"
[[ -f /opt/radiobot/patches/instance-routing.py ]] && python3 /opt/radiobot/patches/instance-routing.py || true
[[ -f /opt/radiobot/patches/web-auth.py ]] && {
  python3 /opt/radiobot/patches/web-auth.py
  cd /opt/radiobot/backend
  npm install --include=dev --no-audit --no-fund
  npm run build
  npm prune --omit=dev --no-audit --no-fund
  systemctl restart radiobot.service
} || true
if [[ -t 1 ]]; then G=$'\033[1;32m'; C=$'\033[1;36m'; Y=$'\033[1;33m'; R=$'\033[0m'; else G='' C='' Y='' R=''; fi
IP=$(hostname -I | awk '{print $1}')
SETUP=$(grep '^SETUP_TOKEN=' /etc/radiobot/radiobot.env 2>/dev/null | cut -d= -f2- || true)
printf '\n%s========================================%s\n' "$G" "$R"
printf '%sMusikBot187 Installation abgeschlossen%s\n' "$G" "$R"
printf '%sDashboard:%s http://%s:3000\n' "$C" "$R" "$IP"
[[ -n "$SETUP" ]] && printf '%sErsteinrichtung:%s http://%s:3000/#setup=%s\n' "$Y" "$R" "$IP" "$SETUP"
if systemctl is-active --quiet radiobot.service; then printf '%sStatus:%s läuft\n' "$C" "$R"; else printf '%sStatus:%s nicht aktiv – bitte journalctl -u radiobot prüfen\n' "$C" "$R"; fi
printf '%s========================================%s\n\n' "$G" "$R"
