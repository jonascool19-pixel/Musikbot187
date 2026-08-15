#!/usr/bin/env python3
from pathlib import Path

p = Path('/opt/radiobot/backend/src/index.ts')
s = p.read_text(encoding='utf-8')

def replace(old: str, new: str, label: str) -> None:
    global s
    if old in s:
        s = s.replace(old, new, 1)
    elif new not in s:
        raise SystemExit(f'missing security marker: {label}')

replace(
    "function controlAllowed(member: any) { if (!DISCORD_CONTROL_ROLE) return true; return Boolean(member?.permissions?.has('Administrator') || member?.roles?.cache?.has(DISCORD_CONTROL_ROLE)); }",
    "function controlAllowed(member: any) { return Boolean(member?.permissions?.has('Administrator') || (DISCORD_CONTROL_ROLE && member?.roles?.cache?.has(DISCORD_CONTROL_ROLE))); }",
    'discord control defaults',
)
replace(
    "const app = Fastify({ logger: true });",
    "const app = Fastify({ logger: true, bodyLimit: 64 * 1024 });",
    'body limit',
)
replace(
    "app.post<{ Params: { id: string }; Body: { volume: number } }>('/api/state/:id/volume', async req => { const s = guildState(req.params.id); s.volume = Math.max(0, Math.min(100, Number(req.body.volume))); saveJson(DB_FILE, db); await updateStatus(req.params.id); return s; });",
    "app.post<{ Params: { id: string }; Body: { volume: number } }>('/api/state/:id/volume', async req => { const value = Number(req.body.volume); if (!Number.isFinite(value)) throw new Error('Ungültige Lautstärke.'); const s = guildState(req.params.id); s.volume = Math.max(0, Math.min(100, Math.round(value))); saveJson(DB_FILE, db); await updateStatus(req.params.id); return s; });",
    'volume validation',
)
# Keep the in-memory request limiter bounded even if many unique client IPs appear.
marker = "const requestBuckets = new Map<string, { start: number; count: number }>();"
if marker in s and "requestBucketsCleanup" not in s:
    s = s.replace(marker, marker + "\nconst requestBucketsCleanup = setInterval(() => { const cutoff = Date.now() - RATE_WINDOW_MS * 2; for (const [ip, bucket] of requestBuckets) if (bucket.start < cutoff) requestBuckets.delete(ip); }, RATE_WINDOW_MS); requestBucketsCleanup.unref?.();", 1)

p.write_text(s, encoding='utf-8')
print('security-final applied')
