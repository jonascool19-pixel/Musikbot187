#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo 'Bitte mit sudo ausführen.' >&2; exit 1; }

ENV_FILE=/etc/musikbot187.env
STATE_FILE=/var/lib/musikbot187/state.json
[[ -f "$ENV_FILE" ]] || { echo 'MusikBot187 ist noch nicht vollständig installiert.' >&2; exit 1; }

# Ein vorhandenes Hauptkonto darf über diesen Notfallweg niemals verändert
# oder umgangen werden. Der Befehl ist ausschließlich für die Ersteinrichtung.
for CANDIDATE in "$STATE_FILE" "$STATE_FILE.bak"; do
  [[ -f "$CANDIDATE" ]] || continue
  set +e
  node -e 'const fs=require("node:fs");try{const state=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.exit(Array.isArray(state.users)&&state.users.length?10:0)}catch{process.exit(11)}' "$CANDIDATE"
  STATE_STATUS=$?
  set -e
  case "$STATE_STATUS" in
    0) ;;
    10) echo 'Die Ersteinrichtung ist bereits abgeschlossen. Bitte normal am Dashboard anmelden.' >&2; exit 1 ;;
    *) echo 'Der Einrichtungsstatus konnte nicht sicher gelesen werden. Es wurde nichts verändert.' >&2; exit 1 ;;
  esac
done

TOKEN="$(openssl rand -hex 32)"
TEMP_ENV="$(mktemp)"
trap 'rm -f "$TEMP_ENV"' EXIT
awk -v token="$TOKEN" '
  BEGIN { replaced=0 }
  /^MUSIKBOT187_SETUP_TOKEN=/ {
    if (!replaced) print "MUSIKBOT187_SETUP_TOKEN=" token
    replaced=1
    next
  }
  { print }
  END { if (!replaced) print "MUSIKBOT187_SETUP_TOKEN=" token }
' "$ENV_FILE" > "$TEMP_ENV"
install -o root -g root -m 0600 "$TEMP_ENV" "$ENV_FILE"
systemctl restart musikbot187.service

ONLINE=0
for _ in {1..20}; do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then ONLINE=1; break; fi
  sleep 0.5
done
[[ "$ONLINE" -eq 1 ]] || { echo 'Der MusikBot ist nach dem Neustart nicht erreichbar. Bitte den Dienststatus prüfen.' >&2; exit 1; }

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[[ -n "$IP" ]] || IP=SERVER-IP
echo 'Neuer Einrichtungslink:'
echo "http://$IP:3000/#setup=$TOKEN"
