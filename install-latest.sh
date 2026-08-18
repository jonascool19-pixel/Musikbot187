#!/usr/bin/env bash
set -euo pipefail
REF="${MUSIKBOT187_REF:-15e03967c56da52830e36babe7eaeb92275ca73c}"
TMP_INSTALL="$(mktemp)"
trap 'rm -f "$TMP_INSTALL"' EXIT
curl -fsSL "https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-stable.sh" -o "$TMP_INSTALL"
# Keep the existing installer logic, but remove the large green completion frame.
perl -0pi -e 's/\$C_GREEN_BG//g; s/[╔╗╚╝═║]//g' "$TMP_INSTALL"
exec env MUSIKBOT187_REF="$REF" bash "$TMP_INSTALL"
