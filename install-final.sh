#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte mit sudo/root ausführen.' >&2; exit 1; }
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y curl unzip ca-certificates
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
INSTALL_REF="716e4b46c88b11d1365ba713abc7878c7a59a819"
curl -fsSL "https://raw.githubusercontent.com/jonascool19-pixel/radiobot/${INSTALL_REF}/install.sh" -o "$TMP"
chmod +x "$TMP"
exec bash "$TMP"
