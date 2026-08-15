#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte mit sudo/root ausführen.' >&2; exit 1; }
# Bootstrap: install unzip before the real installer and pin the exact installer that contains the Deno fix.
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y curl unzip ca-certificates
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
INSTALL_REF="353a7ca740a58fda9e8b96da241eedfc9f82d9b8"
curl -fsSL "https://raw.githubusercontent.com/jonascool19-pixel/radiobot/${INSTALL_REF}/install.sh" -o "$TMP"
chmod +x "$TMP"
exec bash "$TMP"
