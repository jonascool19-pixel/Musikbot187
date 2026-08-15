#!/usr/bin/env python3
from pathlib import Path
import subprocess

ROOT = Path('/opt/radiobot')
p = ROOT / 'backend/src/index.ts'
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
marker = "const requestBuckets = new Map<string, { start: number; count: number }>();"
if marker in s and "requestBucketsCleanup" not in s:
    s = s.replace(marker, marker + "\nconst requestBucketsCleanup = setInterval(() => { const cutoff = Date.now() - RATE_WINDOW_MS * 2; for (const [ip, bucket] of requestBuckets) if (bucket.start < cutoff) requestBuckets.delete(ip); }, RATE_WINDOW_MS * 2); requestBucketsCleanup.unref?.();", 1)

ops = ROOT / 'patches/system-ops-cooldown.py'
if ops.exists():
    subprocess.run(['python3', str(ops)], check=True)

compat = ROOT / 'patches/ensure-privileged-config.py'
if compat.exists():
    subprocess.run(['python3', str(compat)], check=True)

# Establish one deterministic Unix identity before install/CI lifecycle steps.
# The privileged controller and radiobot.service both use the primary
# "radiobot" group for the socket and service permissions.
if subprocess.run(['getent', 'group', 'radiobot'], capture_output=True).returncode != 0:
    subprocess.run(['groupadd', '--system', 'radiobot'], check=True)

if subprocess.run(['id', '-u', 'radiobot'], capture_output=True).returncode != 0:
    subprocess.run([
        'useradd', '--system', '--no-create-home',
        '--gid', 'radiobot', '--shell', '/usr/sbin/nologin', 'radiobot'
    ], check=True)
else:
    subprocess.run(['usermod', '--gid', 'radiobot', 'radiobot'], check=True)

service = ROOT / 'radiobot.service'
if service.exists():
    ss = service.read_text(encoding='utf-8')
    ss = ss.replace('\nSupplementaryGroups=radiobot-ops', '', 1)
    service.write_text(ss, encoding='utf-8')

print('security-final applied')
