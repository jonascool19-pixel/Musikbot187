#!/usr/bin/env bash
set -euo pipefail

# Final pinned installer for MusikBot187.
# The initial web account is created in the first-run web wizard before
# Discord/Spotify/YouTube configuration becomes available.
PINNED_COMMIT="16240e8fe94cd1fca9007fb087800363300ac6ef"
REPO="jonascool19-pixel/radiobot"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ $EUID -ne 0 ]]; then echo 'Bitte als root ausführen.'; exit 1; fi
if ! command -v curl >/dev/null 2>&1; then echo 'curl fehlt. Der Installer benötigt curl; installiere es mit: apt-get update && apt-get install -y curl' >&2; exit 1; fi

curl -fsSL "https://raw.githubusercontent.com/${REPO}/${PINNED_COMMIT}/install.sh" -o "$TMP_DIR/install.sh"
sed -i "s/^RELEASE_REF=v2\.1\.0$/RELEASE_REF=${PINNED_COMMIT}/" "$TMP_DIR/install.sh"
sed -i 's#refs/heads/\$RELEASE_REF#\$RELEASE_REF#' "$TMP_DIR/install.sh"
grep -q "^RELEASE_REF=${PINNED_COMMIT}$" "$TMP_DIR/install.sh"
if grep -q 'refs/heads/\$RELEASE_REF' "$TMP_DIR/install.sh"; then echo 'Pinned archive URL konnte nicht gesetzt werden.' >&2; exit 1; fi

python3 - "$TMP_DIR/install.sh" <<'PY'
from pathlib import Path
path = Path(__import__('sys').argv[1])
text = path.read_text()
text = text.replace('https://deno.land/install.sh | sh\n', 'https://deno.land/install.sh | sh -s -- -y\n')
path.write_text(text)
PY

bash "$TMP_DIR/install.sh"
if [[ -x /usr/bin/python3 && -f /opt/radiobot/patches/instance-routing.py ]]; then python3 /opt/radiobot/patches/instance-routing.py; fi
if [[ -x /usr/bin/python3 && -f /opt/radiobot/patches/web-auth.py ]]; then
  python3 /opt/radiobot/patches/web-auth.py
  cd /opt/radiobot/backend
  npm install --include=dev --no-audit --no-fund
  npm run build
  npm prune --omit=dev --no-audit --no-fund
  systemctl restart radiobot.service
  systemctl restart radiobot-ts3.service 2>/dev/null || true
fi

if [[ -t 1 ]]; then GREEN=$'\033[1;32m'; CYAN=$'\033[1;36m'; YELLOW=$'\033[1;33m'; RESET=$'\033[0m'; else GREEN='' CYAN='' YELLOW='' RESET=''; fi
IP=$(hostname -I | awk '{print $1}')
SETUP=$(grep '^SETUP_TOKEN=' /etc/radiobot/radiobot.env 2>/dev/null | cut -d= -f2- || true)
printf '\n%s========================================%s\n' "$GREEN" "$RESET"
printf '%s  MusikBot187 Installation abgeschlossen%s\n' "$GREEN" "$RESET"
printf '%s========================================%s\n' "$GREEN" "$RESET"
printf '%sWeb-Benutzer:%s wird im ersten Einrichtungsdialog erstellt\n' "$CYAN" "$RESET"
printf '%sDashboard:%s http://%s:3000\n' "$CYAN" "$RESET" "$IP"
if [[ -n "$SETUP" ]]; then printf '%sErsteinrichtung:%s http://%s:3000/#setup=%s\n' "$YELLOW" "$RESET" "$IP" "$SETUP"; fi
if systemctl is-active --quiet radiobot.service; then printf '%sStatus:%s %släuft%s\n' "$CYAN" "$RESET" "$GREEN" "$RESET"; else printf '%sStatus:%s %snicht aktiv – bitte "radiobot status" prüfen%s\n' "$CYAN" "$RESET" "$YELLOW" "$RESET"; fi
if systemctl is-active --quiet radiobot-ts3.service; then printf '%sTS3-Instanz:%s %släuft%s\n' "$CYAN" "$RESET" "$GREEN" "$RESET"; elif [[ -f /etc/radiobot/ts3.env ]]; then printf '%sTS3-Instanz:%s %snicht aktiv – bitte "systemctl status radiobot-ts3" prüfen%s\n' "$CYAN" "$RESET" "$YELLOW" "$RESET"; else printf '%sTS3-Instanz:%s deaktiviert\n' "$CYAN" "$RESET"; fi
printf '%s========================================%s\n\n' "$GREEN" "$RESET"