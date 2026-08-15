#!/usr/bin/env bash
set -euo pipefail

# Final pinned installer for MusikBot187.
# Includes Deno PATH handling, curl diagnostics, Node 24/AF_NETLINK compatibility,
# privileged setup fixes, setup/configuration field compatibility, and browser sessions.
PINNED_COMMIT="3b026e1501a4ae31694b33a27b04b63555049e34"
REPO="jonascool19-pixel/radiobot"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ $EUID -ne 0 ]]; then
  echo 'Bitte als root ausführen.'
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo 'curl fehlt. Der Installer benötigt curl; installiere es mit: apt-get update && apt-get install -y curl' >&2
  exit 1
fi

curl -fsSL "https://raw.githubusercontent.com/${REPO}/${PINNED_COMMIT}/install.sh" -o "$TMP_DIR/install.sh"
sed -i "s/^RELEASE_REF=v2\.1\.0$/RELEASE_REF=${PINNED_COMMIT}/" "$TMP_DIR/install.sh"
sed -i 's#refs/heads/\$RELEASE_REF#\$RELEASE_REF#' "$TMP_DIR/install.sh"

grep -q "^RELEASE_REF=${PINNED_COMMIT}$" "$TMP_DIR/install.sh"
if grep -q 'refs/heads/\$RELEASE_REF' "$TMP_DIR/install.sh"; then
  echo 'Pinned archive URL konnte nicht gesetzt werden.' >&2
  exit 1
fi

bash "$TMP_DIR/install.sh"

# Apply browser-session authentication after the base installer has materialized /opt/radiobot.
if [[ -x /usr/bin/python3 && -f /opt/radiobot/patches/web-auth.py ]]; then
  python3 /opt/radiobot/patches/web-auth.py
  cd /opt/radiobot/backend
  npm run build
  systemctl restart radiobot.service
fi
