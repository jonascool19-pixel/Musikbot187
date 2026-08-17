#!/usr/bin/env bash
set -euo pipefail
ACTION="${1:-}"
case "$ACTION" in
  restart-bot) systemctl restart musikbot187 ;;
  stop-bot) systemctl stop musikbot187 ;;
  restart-system) systemctl reboot ;;
  shutdown-system) systemctl poweroff ;;
  *) echo "Ungültige Aktion" >&2; exit 2 ;;
esac
