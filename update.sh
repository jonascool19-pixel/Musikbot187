#!/usr/bin/env bash
set -euo pipefail
PINNED_COMMIT=3c0d93c9bb071dca86b9805e0364810985399bba
REPO=jonascool19-pixel/radiobot
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
command -v curl >/dev/null 2>&1 || { echo 'curl fehlt. Bitte apt-get update && apt-get install -y curl ausführen.' >&2; exit 1; }
curl -fsSL "https://raw.githubusercontent.com/${REPO}/${PINNED_COMMIT}/install.sh" -o "$TMP_DIR/install.sh"
sed -i "s/^RELEASE_REF=v2\.1\.0$/RELEASE_REF=${PINNED_COMMIT}/" "$TMP_DIR/install.sh"
sed -i 's#refs/heads/\$RELEASE_REF#\$RELEASE_REF#' "$TMP_DIR/install.sh"
grep -q "^RELEASE_REF=${PINNED_COMMIT}$" "$TMP_DIR/install.sh"
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
