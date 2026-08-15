#!/usr/bin/env bash
set -euo pipefail
RELEASE_REF=v2.1.0
curl -fsSL "https://raw.githubusercontent.com/jonascool19-pixel/radiobot/${RELEASE_REF}/install.sh" | sudo bash
