#!/usr/bin/env bash
set -euo pipefail
# Pins to the complete installer payload; patch the downloaded legacy installer
# into the deterministic radiobot primary-group/socket layout before execution.
PINNED_COMMIT="b1fa7524b0d1ada87305479592b2deb06bd2142d"
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
import sys
p = Path(sys.argv[1])
s = p.read_text()
s = s.replace('https://deno.land/install.sh | sh\n', 'https://deno.land/install.sh | sh -s -- -y\n')
old = '''if ! id -u radiobot >/dev/null 2>&1; then useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin radiobot; fi
# The web service must be able to talk to the root-owned privileged controller.
# The controller intentionally owns the socket but grants rw access through this group.
getent group radiobot-ops >/dev/null 2>&1 || groupadd --system radiobot-ops
usermod -a -G radiobot-ops radiobot
chown -R radiobot:radiobot "$APP_DIR" "$DATA_DIR"; chmod 700 "$DATA_DIR"'''
new = '''getent group radiobot >/dev/null 2>&1 || groupadd --system radiobot
if ! id -u radiobot >/dev/null 2>&1; then
  useradd --system --home-dir "$DATA_DIR" --gid radiobot --shell /usr/sbin/nologin radiobot
else
  usermod --gid radiobot radiobot
fi
chown -R radiobot:radiobot "$APP_DIR" "$DATA_DIR"; chmod 700 "$DATA_DIR"'''
if old not in s:
    raise SystemExit('installer bootstrap group marker not found')
s = s.replace(old, new, 1)
old_tail = '''SOCK_GROUP=$(stat -c '%G' /run/radiobot-privileged.sock 2>/dev/null || true)
getent group radiobot-ops >/dev/null || { echo 'radiobot-ops Gruppe fehlt.' >&2; exit 1; }
id radiobot | grep -q 'radiobot-ops' || { echo 'radiobot-ops Mitgliedschaft fehlt.' >&2; exit 1; }
if [[ "$SOCK_GROUP" != 'radiobot-ops' ]]; then echo "Privileged socket group unexpected: $SOCK_GROUP" >&2; exit 1; fi'''
new_tail = '''SOCK_GROUP=$(stat -c '%G' /run/radiobot-privileged.sock 2>/dev/null || true)
getent group radiobot >/dev/null || { echo 'radiobot Gruppe fehlt.' >&2; exit 1; }
if [[ "$SOCK_GROUP" != 'radiobot' ]]; then echo "Privileged socket group unexpected: $SOCK_GROUP" >&2; exit 1; fi'''
if old_tail in s:
    s = s.replace(old_tail, new_tail, 1)
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
if systemctl is-active --quiet radiobot.service; then printf '%sStatus:%s läuft\n' "$C" "$R"; else printf '%sStatus:%s nicht aktiv – bitte journalctl -u radiobot prüfen\n' "$Y" "$R"; fi
printf '%s========================================%s\n\n' "$G" "$R"
