#!/usr/bin/env bash
set -euo pipefail
ACTION="${1:-}"
case "$ACTION" in
  start-bot) /usr/bin/systemctl start musikbot187 ;;
  restart-bot) /usr/bin/systemctl restart musikbot187 ;;
  stop-bot) /usr/bin/systemctl stop musikbot187 ;;
  restart-system) /usr/bin/systemctl reboot ;;
  shutdown-system) /usr/bin/systemctl poweroff ;;
  *) echo "Ungültige Aktion" >&2; exit 2;;
esac
