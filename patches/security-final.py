#!/usr/bin/env python3
from pathlib import Path
import os
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
    s = s.replace(marker, marker + "\nconst requestBucketsCleanup = setInterval(() => { const cutoff = Date.now() - RATE_WINDOW_MS * 2; for (const [ip, bucket] of requestBuckets) if (bucket.start < cutoff) requestBuckets.delete(ip); }, RATE_WINDOW_MS); requestBucketsCleanup.unref?.();", 1)

p.write_text(s, encoding='utf-8')

ops = ROOT / 'patches/system-ops-cooldown.py'
if ops.exists():
    subprocess.run(['python3', str(ops)], check=True)

if subprocess.run(['getent', 'group', 'radiobot-ops'], capture_output=True).returncode != 0:
    subprocess.run(['groupadd', '--system', 'radiobot-ops'], check=True)
if subprocess.run(['id', '-u', 'radiobot'], capture_output=True).returncode == 0:
    subprocess.run(['usermod', '-a', '-G', 'radiobot-ops', 'radiobot'], check=True)

privileged_service = '''[Unit]\nDescription=MusikBot187 privileged operations controller\nAfter=local-fs.target\n\n[Service]\nType=simple\nUser=root\nGroup=root\nExecStart=/usr/bin/python3 /usr/local/libexec/radiobot/radiobot-privileged.py\nRestart=always\nRestartSec=1\nPrivateTmp=true\nProtectSystem=strict\nProtectHome=true\nProtectKernelTunables=true\nProtectKernelModules=true\nProtectControlGroups=true\nRestrictNamespaces=true\nRestrictSUIDSGID=true\nLockPersonality=true\nMemoryDenyWriteExecute=true\nReadWritePaths=/run\nUMask=0077\n\n[Install]\nWantedBy=multi-user.target\n'''
Path('/etc/systemd/system/radiobot-privileged.service').write_text(privileged_service, encoding='utf-8')
os.chmod('/etc/systemd/system/radiobot-privileged.service', 0o644)

service = ROOT / 'radiobot.service'
if service.exists():
    ss = service.read_text(encoding='utf-8')
    if 'After=radiobot-privileged.service' not in ss:
        ss = ss.replace('After=network-online.target', 'After=network-online.target radiobot-privileged.service', 1)
    if 'Wants=radiobot-privileged.service' not in ss:
        ss = ss.replace('Wants=network-online.target', 'Wants=network-online.target radiobot-privileged.service', 1)
    if 'SupplementaryGroups=radiobot-ops' not in ss:
        ss = ss.replace('Group=radiobot', 'Group=radiobot\nSupplementaryGroups=radiobot-ops', 1)
    service.write_text(ss, encoding='utf-8')

# Run setup routing last so later hardening/system patches cannot remove the wizard routes.
final_setup = ROOT / 'patches/final-setup-routes.py'
if final_setup.exists():
    subprocess.run(['python3', str(final_setup)], check=True)
else:
    raise SystemExit('final-setup-routes.py missing')

subprocess.run(['systemctl', 'daemon-reload'], check=False)
subprocess.run(['systemctl', 'enable', '--now', 'radiobot-privileged.service'], check=False)
print('security-final applied')
