#!/usr/bin/env bash
set -u

OUT="${1:-musikbot187-diagnostic-$(date +%Y%m%d-%H%M%S).txt}"
APP="/opt/musikbot187"
DATA="/var/lib/musikbot187"
SERVICE="musikbot187.service"
CONTROL="musikbot187-control.service"

exec > >(tee "$OUT") 2>&1

echo "===== MusikBot187 Live-Diagnose ====="
echo "Zeit: $(date --iso-8601=seconds 2>/dev/null || date)"
echo "Host: $(hostname 2>/dev/null || true)"
echo "Kernel: $(uname -a 2>/dev/null || true)"
echo

echo "===== 1. Service-Status ====="
sudo systemctl --no-pager --full status "$SERVICE" || true
echo
sudo systemctl --no-pager --full status "$CONTROL" || true
echo

echo "===== 2. Service-Zustand ====="
sudo systemctl is-active "$SERVICE" || true
sudo systemctl is-enabled "$SERVICE" || true
sudo systemctl is-active "$CONTROL" || true
sudo systemctl is-enabled "$CONTROL" || true
echo

echo "===== 3. Letzte MusikBot-Logs (Setup/Auth-relevant) ====="
sudo journalctl -u "$SERVICE" -n 500 --no-pager -o short-iso 2>/dev/null || true
echo
sudo journalctl -u "$SERVICE" -n 1000 --no-pager -o cat 2>/dev/null \
  | grep -Ei 'setup|initial|admin|login|auth|user|session|error|warn|fail|401|403|500' \
  | tail -n 300 || true
echo

echo "===== 4. Control-Daemon-Logs ====="
sudo journalctl -u "$CONTROL" -n 300 --no-pager -o short-iso 2>/dev/null || true
echo

echo "===== 5. Installations-/Umgebungsdaten (Secrets geschwärzt) ====="
if sudo test -f /etc/musikbot187.env; then
  sudo sed -E \
    -e 's/^(MUSIKBOT187_SETUP_TOKEN=).*/\1[REDACTED]/' \
    -e 's/^(.*PASSWORD.*=).*/\1[REDACTED]/I' \
    -e 's/^(.*TOKEN.*=).*/\1[REDACTED]/I' \
    -e 's/^(.*SECRET.*=).*/\1[REDACTED]/I' \
    /etc/musikbot187.env || true
else
  echo "/etc/musikbot187.env nicht gefunden"
fi
echo

echo "===== 6. Installierter Git-Stand ====="
if sudo test -d "$APP/.git"; then
  sudo git -C "$APP" rev-parse HEAD 2>/dev/null || true
  sudo git -C "$APP" status --short --branch 2>/dev/null || true
  sudo git -C "$APP" remote -v 2>/dev/null || true
else
  echo "$APP/.git nicht gefunden"
fi
echo

echo "===== 7. Relevante Frontend-Dateien / Hashes ====="
for f in \
  "$APP/frontend/index.html" \
  "$APP/frontend/app.js" \
  "$APP/frontend/setup-security.js" \
  "$APP/frontend/login-bootstrap.js" \
  "$APP/frontend/setup-guard.js" \
  "$APP/frontend/auth-session-fix.js" \
  "$APP/frontend/login-fix.js"
do
  if sudo test -f "$f"; then
    printf '%s  ' "$f"
    sudo sha256sum "$f" | awk '{print $1}'
  else
    echo "FEHLT: $f"
  fi
done
echo

echo "===== 8. Setup-/Login-Codeausschnitte ====="
for f in \
  "$APP/frontend/app.js" \
  "$APP/frontend/setup-security.js" \
  "$APP/frontend/login-bootstrap.js" \
  "$APP/frontend/setup-guard.js" \
  "$APP/backend/src/server.js" \
  "$APP/backend/src/store.js"
do
  if sudo test -f "$f"; then
    echo "----- $f -----"
    sudo grep -nEi \
      'api/setup|initialized|createAdmin|createUser|login\(|logout|setup-token|MUSIKBOT187_SETUP_TOKEN|sessionStorage|auth-changed|setup=' \
      "$f" 2>/dev/null | head -n 250 || true
  fi
done
echo

echo "===== 9. Datenbank-Datei: Metadaten, KEIN Inhalt ====="
if sudo test -f "$DATA/data.json"; then
  sudo stat "$DATA/data.json" 2>/dev/null || true
  sudo node - "$DATA/data.json" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
try {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const users = Array.isArray(data.users) ? data.users.map(u => ({
    id: u.id,
    name: u.name,
    role: u.role,
    hasPermissions: !!u.permissions,
    permissionCount: Array.isArray(u.permissions) ? u.permissions.length : null
  })) : [];
  console.log(JSON.stringify({
    users,
    userCount: users.length,
    hasSettings: !!data.settings,
    hasPlaylists: Array.isArray(data.playlists),
    hasDiscord: Array.isArray(data.discord),
    hasTs3: Array.isArray(data.ts3)
  }, null, 2));
} catch (e) {
  console.log("DATA_JSON_PARSE_ERROR:", e.message);
}
NODE
else
  echo "$DATA/data.json nicht gefunden"
fi
echo

echo "===== 10. Laufende Prozesse / Ports ====="
sudo pgrep -af 'musikbot187|src/server.js|control-daemon.js' || true
sudo ss -lntp 2>/dev/null | grep -E ':3000\b' || true
echo

echo "===== 11. Lokale HTTP-Checks ====="
echo "--- GET /api/setup ---"
curl -sS -i --max-time 5 http://127.0.0.1:3000/api/setup 2>&1 || true
echo
echo "--- GET / ---"
curl -sS -I --max-time 5 http://127.0.0.1:3000/ 2>&1 || true
echo

echo "===== 12. Service-Fehler seit letztem Start ====="
sudo journalctl -u "$SERVICE" --since "2 hours ago" --no-pager -o cat 2>/dev/null \
  | grep -Ei 'error|warn|exception|uncaught|setup|auth|login|session' \
  | tail -n 300 || true
echo

echo "===== ENDE DER DIAGNOSE ====="
echo "Ausgabedatei: $OUT"
echo "Die Datei enthält absichtlich keine Passwörter, Setup-Tokens oder Secrets."
