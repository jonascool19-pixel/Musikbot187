#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte mit sudo/root ausführen.' >&2; exit 1; }
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y curl unzip ca-certificates
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
INSTALL_REF="c946b5b825a663c03c8d924f6c5ada500bae80e6"
curl -fsSL "https://raw.githubusercontent.com/jonascool19-pixel/radiobot/${INSTALL_REF}/install.sh" -o "$TMP"
chmod +x "$TMP"
exec bash "$TMP"
