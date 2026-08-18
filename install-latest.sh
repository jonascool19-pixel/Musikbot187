#!/usr/bin/env bash
set -euo pipefail
REF="${MUSIKBOT187_REF:-15e03967c56da52830e36babe7eaeb92275ca73c}"
exec env MUSIKBOT187_REF="$REF" bash <(curl -fsSL "https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-stable.sh")
