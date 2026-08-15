#!/usr/bin/env bash
set -euo pipefail
RELEASE_REF=v2.1.0
PINNED_COMMIT=da5d39965f39e4e8835fdba97248447d03a1318f
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
exec bash "$TMP_DIR/install.sh"
