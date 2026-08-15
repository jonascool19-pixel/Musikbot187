#!/usr/bin/env python3
from pathlib import Path

ROOT = Path('/opt/radiobot')
BACKEND = ROOT / 'backend/src/index.ts'
FRONTEND = ROOT / 'frontend'

s = BACKEND.read_text(encoding='utf-8')

if 'const webSessions = new Map<string, { user: string; expires: number }>();' not in s:
    marker = "const searches = new Map<string, { expires: number; items: SearchItem[] }>();"
    if marker not in s:
        raise SystemExit('session insertion marker missing')
    s = s.replace(marker, marker + "\nconst webSessions = new Map<string, { user: string; expires: number }>();\nconst WEB_SESSION_TTL_MS = 8 * 60 * 60 * 1000;\n", 1)

if 'function parseCookieHeader(value: string)' not in s:
    marker = "const db = loadJson<Db>(DB_FILE, { radios: [], guilds: {}, playlists: [] });"
    if marker not in s:
        raise SystemExit('auth route insertion marker missing')
    helper = r'''
function parseCookieHeader(value: string) {
  const out: Record<string, string> = {};
  for (const part of value.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function webAuth(req: any, reply: any) {
  if (!WEB_PASSWORD) return true;
  const origin = String(req.headers.origin ?? '');
  if (origin) {
    const host = String(req.headers.host ?? '');
    const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim();
    const protocol = forwardedProto || 'http';
    const trustedOrigin = `${protocol}://${host}`;
    if (origin !== trustedOrigin) {
      reply.code(403).send({ error: 'ORIGIN_FORBIDDEN' });
      return false;
    }
  }
  const cookies = parseCookieHeader(String(req.headers.cookie ?? ''));
  const token = cookies.musikbot187_session;
  if (token) {
    const session = webSessions.get(token);
    if (session && session.expires > Date.now()) return true;
    if (session) webSessions.delete(token);
  }
  const h = String(req.headers.authorization ?? '');
  if (h.startsWith('Basic ')) {
    const d = Buffer.from(h.slice(6), 'base64').toString('utf8');
    const i = d.indexOf(':');
    const u = i >= 0 ? d.slice(0, i) : '';
    const p = i >= 0 ? d.slice(i + 1) : '';
    if (u === WEB_USER && p === WEB_PASSWORD) return true;
  }
  reply.code(401).send({ error: 'AUTH_REQUIRED' });
  return false;
}
'''
    s = s.replace(marker, helper + "\n" + marker, 1)
else:
    old = "function webAuth(req: any, reply: any) {\n  if (!WEB_PASSWORD) return true;"
    new = "function webAuth(req: any, reply: any) {\n  if (!WEB_PASSWORD) return true;\n  const origin = String(req.headers.origin ?? '');\n  if (origin) {\n    const host = String(req.headers.host ?? '');\n    const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim();\n    const protocol = forwardedProto || 'http';\n    const trustedOrigin = `${protocol}://${host}`;\n    if (origin !== trustedOrigin) { reply.code(403).send({ error: 'ORIGIN_FORBIDDEN' }); return false; }\n  }"
    if old in s and 'ORIGIN_FORBIDDEN' not in s:
        s = s.replace(old, new, 1)

# Final auth hook: preserve first-user bootstrap restrictions.
new_hook = "app.addHook('preHandler', async (req, reply) => { const authOpen = req.url.startsWith('/api/auth/'); const setupStatusOpen = req.url === '/api/setup/status'; const setupUserOpen = req.url === '/api/setup/user'; const spotifyCallbackOpen = req.url.startsWith('/api/spotify/callback'); if (req.url === '/api/setup' && !WEB_PASSWORD) return reply.code(403).send('Bitte zuerst einen Web-Benutzer anlegen.'); const open = authOpen || setupStatusOpen || setupUserOpen || spotifyCallbackOpen; if (req.url.startsWith('/api/') && !open && !webAuth(req, reply)) return reply; });"
if "const authOpen = req.url.startsWith('/api/auth/')" not in s:
    start = s.find("app.addHook('preHandler'")
    if start >= 0:
        end = s.find("\n\n", start)
        if end < 0:
            end = len(s)
        s = s[:start] + new_hook + s[end:]
    else:
        anchor = "const app = Fastify({ logger: true"
        app_pos = s.find(anchor)
        if app_pos < 0:
            raise SystemExit('auth hook insertion anchor missing')
        line_end = s.find('\n', app_pos)
        if line_end < 0:
            raise SystemExit('auth app declaration line missing')
        s = s[:line_end + 1] + new_hook + "\n" + s[line_end + 1:]

if "app.post('/api/auth/login'" not in s:
    anchor = "app.get('/api/health'"
    if anchor not in s:
        raise SystemExit('health route anchor missing')
    auth_routes = r'''app.get('/api/auth/session', async (req, reply) => {
  const cookies = parseCookieHeader(String(req.headers.cookie ?? ''));
  const token = cookies.musikbot187_session;
  const session = token ? webSessions.get(token) : undefined;
  if (!session || session.expires <= Date.now()) {
    if (token) webSessions.delete(token);
    return reply.code(401).send({ authenticated: false });
  }
  session.expires = Date.now() + WEB_SESSION_TTL_MS;
  return { authenticated: true, user: session.user, expiresAt: session.expires };
});
app.post<{ Body: { username?: string; password?: string } }>('/api/auth/login', async (req, reply) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!WEB_PASSWORD || username !== WEB_USER || password !== WEB_PASSWORD) return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
  const token = crypto.randomBytes(32).toString('hex');
  webSessions.set(token, { user: username, expires: Date.now() + WEB_SESSION_TTL_MS });
  while (webSessions.size > 64) {
    const oldest = webSessions.keys().next().value;
    if (!oldest) break;
    webSessions.delete(oldest);
  }
  reply.header('Set-Cookie', `musikbot187_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(WEB_SESSION_TTL_MS / 1000)}`);
  return { ok: true, user: username };
});
app.post('/api/auth/logout', async (req, reply) => {
  const token = parseCookieHeader(String(req.headers.cookie ?? '')).musikbot187_session;
  if (token) webSessions.delete(token);
  reply.header('Set-Cookie', 'musikbot187_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return { ok: true };
});
'''
    s = s.replace(anchor, auth_routes + "\n" + anchor, 1)

BACKEND.write_text(s, encoding='utf-8')

ui = r'''(() => {
  const state = { authenticated: false, user: null };
  const css = `#musikbot-login-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(7,10,18,.78);backdrop-filter:blur(12px);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}#musikbot-login-card{width:min(420px,calc(100vw - 32px));padding:32px;border-radius:24px;background:#111827;color:#f8fafc;box-shadow:0 24px 80px rgba(0,0,0,.45)}#musikbot-login-card h1{margin:0 0 8px;font-size:28px}#musikbot-login-card p{margin:0 0 22px;color:#94a3b8}#musikbot-login-card label{display:block;margin:14px 0 6px;font-size:13px;color:#cbd5e1}#musikbot-login-card input{width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #334155;border-radius:12px;background:#0f172a;color:#fff;font-size:15px}#musikbot-login-card button{width:100%;margin-top:18px;padding:12px 14px;border:0;border-radius:12px;background:#6366f1;color:#fff;font-weight:700;cursor:pointer}#musikbot-login-error{min-height:20px;margin-top:10px;color:#fca5a5;font-size:13px}.musikbot-user-menu{display:flex;gap:8px;align-items:center}.musikbot-logout{border:1px solid #334155;background:transparent;color:inherit;border-radius:10px;padding:7px 10px;cursor:pointer}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  function overlay(){if(document.getElementById('musikbot-login-overlay'))return;const wrap=document.createElement('div');wrap.id='musikbot-login-overlay';wrap.innerHTML='<div id="musikbot-login-card"><h1>MusikBot187</h1><p>Anmelden, um das Webinterface zu öffnen.</p><form id="musikbot-login-form"><label>Benutzername</label><input name="username" autocomplete="username" required><label>Passwort</label><input name="password" type="password" autocomplete="current-password" required><div id="musikbot-login-error"></div><button type="submit">Anmelden</button></form></div>';document.body.appendChild(wrap);wrap.querySelector('input[name=username]')?.focus();wrap.querySelector('form')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const data=Object.fromEntries(new FormData(form));const err=wrap.querySelector('#musikbot-login-error');err.textContent='';try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw new Error('Benutzername oder Passwort ist falsch.');location.reload();}catch(ex){err.textContent=ex instanceof Error?ex.message:'Anmeldung fehlgeschlagen.';}})}
  function hide(){document.getElementById('musikbot-login-overlay')?.remove()}
  function addLogout(){if(document.querySelector('.musikbot-user-menu'))return;const row=document.querySelector('header .row');if(!row)return;const box=document.createElement('div');box.className='musikbot-user-menu';box.innerHTML='<span id="musikbot-user-name"></span><button class="musikbot-logout" type="button">Abmelden</button>';row.appendChild(box);box.querySelector('.musikbot-logout')?.addEventListener('click',async()=>{await fetch('/api/auth/logout',{method:'POST'});location.reload()});const name=box.querySelector('#musikbot-user-name');if(name)name.textContent=state.user||'admin'}
  async function check(){try{const r=await fetch('/api/auth/session',{cache:'no-store'});if(!r.ok){state.authenticated=false;overlay();return}const d=await r.json();state.authenticated=Boolean(d.authenticated);state.user=d.user||null;if(state.authenticated){hide();setTimeout(addLogout,0)}else overlay()}catch{overlay()}}
  const originalFetch=window.fetch;window.fetch=async(...args)=>{const r=await originalFetch(...args);const url=typeof args[0]==='string'?args[0]:args[0]?.url||'';if(r.status===401&&!url.includes('/api/auth/')){state.authenticated=false;overlay()}return r};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',check);else check();
})();
'''
(FRONTEND / 'web-auth.js').write_text(ui, encoding='utf-8')
index = FRONTEND / 'index.html'
html = index.read_text(encoding='utf-8')
if 'web-auth.js' not in html:
    html = html.replace('</body>', '<script src="/web-auth.js"></script></body>', 1) if '</body>' in html else html + '<script src="/web-auth.js"></script>\n'
    index.write_text(html, encoding='utf-8')
print('web auth patch applied with origin protection + first-user gate')
