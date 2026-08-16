import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DATA_DIR } from './config.js';

export type NetworkStats = {
  interface: string;
  rxRate: number;
  txRate: number;
  rxTotal: number;
  txTotal: number;
  total: number;
  at: number;
};

type Persisted = Record<string, { rxRaw: number; txRaw: number; rxTotal: number; txTotal: number; at: number }>;
const FILE = path.join(DATA_DIR, 'network-totals.json');
let cache: Persisted = {};
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (parsed && typeof parsed === 'object') cache = parsed;
  } catch { cache = {}; }
}
function save() {
  const tmp = `${FILE}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}
function rawCounters(): Record<string, { rx: number; tx: number }> {
  const out: Record<string, { rx: number; tx: number }> = {};
  try {
    for (const line of fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2)) {
      const match = line.match(/^\s*([^:]+):\s*(.+)$/);
      if (!match) continue;
      const iface = match[1].trim();
      if (iface === 'lo') continue;
      const fields = match[2].trim().split(/\s+/).map(Number);
      if (fields.length < 9 || !Number.isFinite(fields[0]) || !Number.isFinite(fields[8])) continue;
      out[iface] = { rx: fields[0], tx: fields[8] };
    }
  } catch { return {}; }
  return out;
}
export function networkInterfaces() {
  const list = Object.keys(rawCounters()).sort((a, b) => a.localeCompare(b, 'de'));
  return ['auto', ...list.filter(x => x !== 'all')];
}
export function networkStats(selected = 'auto'): NetworkStats {
  load();
  const raw = rawCounters();
  const names = selected && selected !== 'auto' && raw[selected] ? [selected] : Object.keys(raw);
  const key = selected && selected !== 'auto' ? `iface:${selected}` : 'auto';
  const rxRaw = names.reduce((sum, name) => sum + raw[name].rx, 0);
  const txRaw = names.reduce((sum, name) => sum + raw[name].tx, 0);
  const now = Math.floor(Date.now() / 1000);
  const previous = cache[key];
  const elapsed = previous && now > previous.at ? now - previous.at : 0;
  let rxTotal = previous?.rxTotal ?? 0;
  let txTotal = previous?.txTotal ?? 0;
  if (previous) {
    rxTotal += rxRaw >= previous.rxRaw ? rxRaw - previous.rxRaw : rxRaw;
    txTotal += txRaw >= previous.txRaw ? txRaw - previous.txRaw : txRaw;
  }
  const rxRate = previous && elapsed > 0 ? Math.max(0, Math.round((rxRaw - previous.rxRaw) / elapsed)) : 0;
  const txRate = previous && elapsed > 0 ? Math.max(0, Math.round((txRaw - previous.txRaw) / elapsed)) : 0;
  cache[key] = { rxRaw, txRaw, rxTotal, txTotal, at: now };
  save();
  return { interface: selected && selected !== 'auto' && raw[selected] ? selected : 'auto', rxRate, txRate, rxTotal, txTotal, total: rxTotal + txTotal, at: now };
}
