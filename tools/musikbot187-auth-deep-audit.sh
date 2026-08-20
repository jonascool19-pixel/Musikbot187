#!/usr/bin/env bash
set -u
OUT="${1:-musikbot187-auth-audit-$(date +%Y%m%d-%H%M%S).txt}"
APP="${MUSIKBOT187_APP_DIR:-/opt/musikbot187}"
DATA="${MUSIKBOT187_DATA_DIR:-/var/lib/musikbot187}"
SERVICE="musikbot187.service"
exec > >(tee "$OUT") 2>&1

echo "===== MusikBot187 AUTH/SETUP/FRONTEND DEEP AUDIT ====="
echo "time=$(date --iso-8601=seconds 2>/dev/null || date)"
echo "host=$(hostname 2>/dev/null || true)"
echo

echo "===== A. INSTALLED VERSION ====="
if sudo test -d "$APP/.git"; then
  echo "git_head=$(sudo git -C "$APP" rev-parse HEAD 2>/dev/null || true)"
  echo "git_branch=$(sudo git -C "$APP" branch --show-current 2>/dev/null || true)"
  echo "git_status:"
  sudo git -C "$APP" status --short --branch 2>/dev/null || true
  echo "git_origin:"
  sudo git -C "$APP" remote -v 2>/dev/null || true
else
  echo "NO_GIT_DIR=$APP/.git"
fi

echo "===== B. SERVICE ====="
sudo systemctl is-active "$SERVICE" 2>/dev/null || true
sudo systemctl --no-pager --full status "$SERVICE" 2>/dev/null || true

echo "===== C. BACKEND SYNTAX / IMPORT AUDIT ====="
for f in "$APP/backend/src/store.js" "$APP/backend/src/permissions.js" "$APP/backend/src/server.js"; do
  echo "--- $f ---"
  if sudo test -f "$f"; then sudo node --check "$f" 2>&1 || true; else echo "MISSING"; fi
done
echo "--- store.js permission import/use ---"
sudo grep -nE 'normalizePermissions|from ["'\'' ]*\./permissions\.js["'\'']' "$APP/backend/src/store.js" 2>/dev/null || true
echo "--- permissions.js export ---"
sudo grep -nE 'export function normalizePermissions|export const ALL_PERMISSIONS|export const DEFAULT_USER_PERMISSIONS' "$APP/backend/src/permissions.js" 2>/dev/null || true

echo "===== D. SETUP/LIVE API STATE ====="
echo "--- GET /api/setup ---"
curl -sS -i --max-time 5 http://127.0.0.1:3000/api/setup 2>&1 || true
echo "--- GET /api/health ---"
curl -sS -i --max-time 5 http://127.0.0.1:3000/api/health 2>&1 || true

echo "===== E. SAFE LOGIN PROBE ====="
echo "Uses deliberately invalid credentials; no real password is collected."
curl -sS -i --max-time 5 -H 'Content-Type: application/json' --data '{"name":"__musikbot187_audit_invalid_user__","password":"invalid-audit-password"}' http://127.0.0.1:3000/api/login 2>&1 || true

echo "===== F. SETUP ROUTE CODE PATH ====="
for f in "$APP/backend/src/server.js" "$APP/backend/src/store.js"; do
  echo "--- $f ---"
  sudo grep -nE 'api/setup|createAdmin\(|return login\(|api/login|function login|function publicUser|validateCredentialInput' "$f" 2>/dev/null | head -n 120 || true
done

echo "===== G. FRONTEND ASSET INVENTORY/HASHES ====="
for f in frontend/index.html frontend/app.js frontend/setup-security.js frontend/setup-guard.js frontend/login-bootstrap.js frontend/login-fix.js frontend/auth-session-fix.js frontend/permission-nav.js frontend/music-ui-auth.js frontend/skip-session-fix.js; do
  p="$APP/$f"
  if sudo test -f "$p"; then printf '%s sha256=' "$f"; sudo sha256sum "$p" | awk '{print $1}'; sudo wc -c "$p" | awk '{print "bytes=" $1}'; else echo "$f MISSING"; fi
done

echo "===== H. FRONTEND LOAD ORDER ====="
if sudo test -f "$APP/frontend/index.html"; then sudo sed -n '1,240p' "$APP/frontend/index.html" | grep -oE '<script[^>]+src="[^"]+"' | nl -ba || true; fi

echo "===== I. AUTH/SETUP STATIC CODE AUDIT ====="
for f in "$APP/frontend/app.js" "$APP/frontend/setup-security.js" "$APP/frontend/setup-guard.js" "$APP/frontend/login-bootstrap.js" "$APP/frontend/login-fix.js" "$APP/frontend/auth-session-fix.js"; do
  if sudo test -f "$f"; then
    echo "--- $(basename "$f") ---"
    sudo grep -nE 'api/setup|api/login|initialized|sessionStorage|musikbot187\.auth|musikbot187\.setupSession|setup=|X-MusikBot-Setup-Token|loginView\(|render\(\)|replaceState|location\.reload|Internal|HTTP' "$f" 2>/dev/null | head -n 300 || true
  fi
done

echo "===== J. DATA STATE (NO PASSWORD HASHES/SECRETS) ====="
if sudo test -f "$DATA/data.json"; then
  sudo node - "$DATA/data.json" <<'NODE'
const fs=require('fs'); const p=process.argv[2];
try { const d=JSON.parse(fs.readFileSync(p,'utf8')); const users=Array.isArray(d.users)?d.users.map(u=>({id:u.id,name:u.name,role:u.role,permissions:Array.isArray(u.permissions)?u.permissions:null})):[]; console.log(JSON.stringify({userCount:users.length,users,settingsPresent:!!d.settings,playlistsCount:Array.isArray(d.playlists)?d.playlists.length:null,discordCount:Array.isArray(d.discord)?d.discord.length:null,ts3Count:Array.isArray(d.ts3)?d.ts3.length:null},null,2)); }
catch(e){ console.log('DATA_PARSE_ERROR',e.message); }
NODE
else echo "MISSING $DATA/data.json"; fi

echo "===== K. ENVIRONMENT (REDACTED) ====="
if sudo test -f /etc/musikbot187.env; then sudo sed -E -e 's/^(.*PASSWORD.*=).*/\1[REDACTED]/I' -e 's/^(.*TOKEN.*=).*/\1[REDACTED]/I' -e 's/^(.*SECRET.*=).*/\1[REDACTED]/I' -e 's/^(.*KEY.*=).*/\1[REDACTED]/I' /etc/musikbot187.env || true; else echo 'MISSING /etc/musikbot187.env'; fi

echo "===== L. RECENT AUTH/SETUP/ERROR JOURNAL ====="
sudo journalctl -u "$SERVICE" --since "3 hours ago" --no-pager -o short-iso 2>/dev/null | grep -Ei 'setup|login|auth|session|user|admin|permission|normalizePermissions|ReferenceError|TypeError|Internal|error|warn|500|401|403' | tail -n 500 || true

echo "===== M. FRONTEND HTTP/STATIC RESPONSE CHECKS ====="
for path in / /index.html /app.js /setup-security.js /setup-guard.js /login-bootstrap.js /login-fix.js /auth-session-fix.js /permissions-ui.js /permission-nav.js; do echo "--- $path ---"; curl -sS -I --max-time 5 "http://127.0.0.1:3000$path" 2>&1 | head -n 12 || true; done

echo "===== N. PROCESS/PORTS ====="
sudo pgrep -af 'musikbot187|src/server.js|node .*server.js' || true
sudo ss -lntp 2>/dev/null | grep -E ':3000\b' || true

echo "===== O. FILEMTIME/CACHE CHECK ====="
for f in "$APP/frontend/index.html" "$APP/frontend/app.js" "$APP/frontend/setup-security.js" "$APP/backend/src/store.js" "$APP/backend/src/permissions.js"; do if sudo test -f "$f"; then sudo stat -c '%n | %y | %s bytes' "$f" 2>/dev/null || true; fi; done

echo "===== END ====="
echo "output=$OUT"
echo "No passwords, password hashes, setup tokens, API tokens, or secret values are intentionally printed."
