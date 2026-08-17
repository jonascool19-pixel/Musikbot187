#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
  restart-bot) systemctl restart musikbot187 ;;
  stop-bot) systemctl stop musikbot187 ;;
  restart-system) systemctl reboot ;;
  shutdown-system) systemctl poweroff ;;
  *) echo "Usage: $0 {restart-bot|stop-bot|restart-system|shutdown-system}"; exit 2 ;;
esac
