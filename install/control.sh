#!/usr/bin/env bash
set -euo pipefail
ACTION="${1:-}"
case "$ACTION" in
  restart-bot) systemctl restart musikbot187 ;;
  stop-bot) systemctl stop musikbot187 ;;
  restart-system|shutdown-system)
    echo "Systemweite Neustart-/Shutdown-Aktionen sind aus Sicherheitsgründen deaktiviert." >&2
    exit 3
    ;;
  *) echo "Ungültige Aktion" >&2; exit 2;;
esac
