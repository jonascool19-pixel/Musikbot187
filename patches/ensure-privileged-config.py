#!/usr/bin/env python3
from pathlib import Path

ROOT = Path('/opt/radiobot')
backend = ROOT / 'backend/src/index.ts'
s = backend.read_text(encoding='utf-8')

if 'async function privilegedConfigWrite(payload: string)' not in s:
    marker = "async function privilegedAction(action: 'bot-restart' | 'bot-update' | 'server-reboot' | 'server-shutdown') {"
    start = s.find(marker)
    if start < 0:
        raise SystemExit('privilegedAction marker missing')
    end = s.find('\n}\n', start)
    if end < 0:
        raise SystemExit('privilegedAction end marker missing')
    insert_at = end + 3
    fn = r'''
async function privilegedConfigWrite(payload: string) {
  if (!payload || Buffer.byteLength(payload, 'utf8') > 16 * 1024) throw new Error('Konfiguration zu groß.');
  return new Promise<void>((resolve, reject) => {
    const socket = net.createConnection(PRIVILEGED_SOCKET);
    let done = false;
    const finish = (error?: Error) => { if (done) return; done = true; socket.destroy(); error ? reject(error) : resolve(); };
    socket.setTimeout(5000, () => finish(new Error('Konfigurationsdienst antwortet nicht.')));
    socket.on('error', error => finish(error));
    socket.on('connect', () => socket.end(`config-write\n${payload}`));
    socket.on('data', chunk => { const response = String(chunk).trim(); if (response === 'OK') finish(); else finish(new Error('Konfiguration wurde abgelehnt.')); });
  });
}
'''
    s = s[:insert_at] + fn + s[insert_at:]

backend.write_text(s, encoding='utf-8')
print('privileged config compatibility patch applied')
