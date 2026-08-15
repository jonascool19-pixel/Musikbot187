#!/usr/bin/env bash
set -euo pipefail

# Final pinned installer for MusikBot187.
# Includes Deno PATH handling, curl diagnostics, Node 24/AF_NETLINK compatibility,
# privileged setup fixes, deterministic dev-dependency installation, interactive
# web-account setup, optional TeamSpeak 3 setup, and a colored final status summary.
PINNED_COMMIT="c70f6a54b4f882f7b03fd1af2efba19af9d12e2c"
REPO="jonascool19-pixel/radiobot"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ $EUID -ne 0 ]]; then echo 'Bitte als root ausführen.'; exit 1; fi
if ! command -v curl >/dev/null 2>&1; then echo 'curl fehlt. Der Installer benötigt curl; installiere es mit: apt-get update && apt-get install -y curl' >&2; exit 1; fi
WEB_USER="admin"
WEB_PASSWORD=""
if [[ -r /dev/tty && -w /dev/tty ]]; then
  printf '\n\033[1;36m=== MusikBot187 Ersteinrichtung ===\033[0m\n' > /dev/tty
  while :; do read -r -p 'Web-Benutzername: ' WEB_USER </dev/tty; [[ -n "$WEB_USER" ]] && break; echo 'Benutzername darf nicht leer sein.' > /dev/tty; done
  while :; do
    read -r -s -p 'Web-Passwort (mindestens 12 Zeichen): ' WEB_PASSWORD </dev/tty; echo > /dev/tty
    if [[ ${#WEB_PASSWORD} -ge 12 ]]; then read -r -s -p 'Web-Passwort wiederholen: ' WEB_PASSWORD_CONFIRM </dev/tty; echo > /dev/tty; [[ "$WEB_PASSWORD" == "$WEB_PASSWORD_CONFIRM" ]] && break; fi
    echo 'Passwörter müssen übereinstimmen und mindestens 12 Zeichen lang sein.' > /dev/tty
  done
  unset WEB_PASSWORD_CONFIRM
else WEB_PASSWORD="$(openssl rand -hex 16)"; fi

curl -fsSL "https://raw.githubusercontent.com/${REPO}/${PINNED_COMMIT}/install.sh" -o "$TMP_DIR/install.sh"
sed -i "s/^RELEASE_REF=v2\.1\.0$/RELEASE_REF=${PINNED_COMMIT}/" "$TMP_DIR/install.sh"
sed -i 's#refs/heads/\$RELEASE_REF#\$RELEASE_REF#' "$TMP_DIR/install.sh"
grep -q "^RELEASE_REF=${PINNED_COMMIT}$" "$TMP_DIR/install.sh"
if grep -q 'refs/heads/\$RELEASE_REF' "$TMP_DIR/install.sh"; then echo 'Pinned archive URL konnte nicht gesetzt werden.' >&2; exit 1; fi

python3 - "$TMP_DIR/install.sh" "$WEB_USER" "$WEB_PASSWORD" <<'PY'
from pathlib import Path
import shlex, sys
path = Path(sys.argv[1]); web_user = sys.argv[2]; web_password = sys.argv[3]; text = path.read_text()
text = text.replace('https://deno.land/install.sh | sh\n', 'https://deno.land/install.sh | sh -s -- -y\n')
marker = 'set -euo pipefail\n'
if marker in text and 'INSTALL_WEB_USER=' not in text:
    text = text.replace(marker, marker + f'INSTALL_WEB_USER={shlex.quote(web_user)}\n' + f'INSTALL_WEB_PASSWORD={shlex.quote(web_password)}\n', 1)
text = text.replace('WEB_USER=admin\n', 'WEB_USER=$INSTALL_WEB_USER\n', 1)
text = text.replace('WEB_PASSWORD=$(openssl rand -hex 16)\n', 'WEB_PASSWORD=$INSTALL_WEB_PASSWORD\n', 1)
path.write_text(text)
PY

bash "$TMP_DIR/install.sh"

# Apply the shared TS3 playlist routing after the base hardening patch.
if [[ -x /usr/bin/python3 && -f /opt/radiobot/patches/instance-routing.py ]]; then python3 /opt/radiobot/patches/instance-routing.py; fi

# Re-apply browser-session authentication and rebuild after all post-install patches.
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
printf '%sWeb-Benutzer:%s %s\n' "$CYAN" "$RESET" "$WEB_USER"
printf '%sWeb-Passwort:%s von dir bei der Installation gesetzt\n' "$CYAN" "$RESET"
printf '%sDashboard:%s http://%s:3000\n' "$CYAN" "$RESET" "$IP"
if [[ -n "$SETUP" ]]; then printf '%sErsteinrichtung:%s http://%s:3000/#setup=%s\n' "$YELLOW" "$RESET" "$IP" "$SETUP"; fi
if systemctl is-active --quiet radiobot.service; then printf '%sStatus:%s %släuft%s\n' "$CYAN" "$RESET" "$GREEN" "$RESET"; else printf '%sStatus:%s %snicht aktiv – bitte "radiobot status" prüfen%s\n' "$CYAN" "$RESET" "$YELLOW" "$RESET"; fi
if systemctl is-active --quiet radiobot-ts3.service; then printf '%sTS3-Instanz:%s %släuft%s\n' "$CYAN" "$RESET" "$GREEN" "$RESET"; elif [[ -f /etc/radiobot/ts3.env ]]; then printf '%sTS3-Instanz:%s %snicht aktiv – bitte "systemctl status radiobot-ts3" prüfen%s\n' "$CYAN" "$RESET" "$YELLOW" "$RESET"; else printf '%sTS3-Instanz:%s deaktiviert\n' "$CYAN" "$RESET"; fi
printf '%s========================================%s\n\n' "$GREEN" "$RESET"
