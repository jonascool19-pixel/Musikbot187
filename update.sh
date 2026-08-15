#!/usr/bin/env bash
set -euo pipefail
PINNED_COMMIT=b1fa7524b0d1ada87305479592b2deb06bd2142d
REPO=jonascool19-pixel/radiobot
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
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
