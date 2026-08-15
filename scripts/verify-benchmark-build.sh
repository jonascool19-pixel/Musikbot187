#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../backend"
npm install --no-audit --no-fund --ignore-scripts
npm run build
