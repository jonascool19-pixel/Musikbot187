#!/usr/bin/env bash
set -euo pipefail
RELEASE_REF=v2.1.0
PINNED_COMMIT=16240e8fe94cd1fca9007fb087800363300ac6ef
REPO=jonascool19-pixel/radiobot
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
if ! command -v curl >/dev/null 2>&1; then
  echo 'curl fehlt. Bitte apt-get update && apt-get install -y curl ausführen.' >&2
  exit 1
fi
curl -fsSL "https://raw.githubusercontent.com/${REPO}/${PINNED_COMMIT}/install.sh" -o "$TMP_DIR/install.sh"
sed -i "s/^RELEASE_REF=v2\.1\.0$/RELEASE_REF=${PINNED_COMMIT}/" "$TMP_DIR/install.sh"
sed -i 's#refs/heads/\$RELEASE_REF#\$RELEASE_REF#' "$TMP_DIR/install.sh"
grep -q "^RELEASE_REF=${PINNED_COMMIT}$" "$TMP_DIR/install.sh"
bash "$TMP_DIR/install.sh"
if [[ -x /usr/bin/python3 && -f /opt/radiobot/patches/instance-routing.py ]]; then python3 /opt/radiobot/patches/instance-routing.py; fi
if [[ -f /opt/radiobot/patches/web-auth.py ]]; then
  python3 /opt/radiobot/patches/web-auth.py
  cd /opt/radiobot/backend
  npm install --include=dev --no-audit --no-fund
  npm run build
  npm prune --omit=dev --no-audit --no-fund
  systemctl restart radiobot.service
  systemctl restart radiobot-ts3.service 2>/dev/null || true
fi