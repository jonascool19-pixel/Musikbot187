import os from 'node:os';
import { readFileSync } from 'node:fs';

let lastNetwork: { at: number; rx: number; tx: number } | null = null;

function readNetworkBytes() {
  let rx = 0;
  let tx = 0;
  try {
    const text = readFileSync('/proc/net/dev', 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([^:]+):\s*(\d+)\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(\d+)/);
      if (!m) continue;
      const iface = m[1].trim();
      if (iface === 'lo') continue;
      rx += Number(m[2]);
      tx += Number(m[3]);
    }
  } catch {}
  return { rx, tx };
}

function networkRate() {
  const now = Date.now();
  const current = readNetworkBytes();
  const previous = lastNetwork;
  lastNetwork = { at: now, ...current };
  if (!previous || now <= previous.at) return { rx: 0, tx: 0, rxTotal: current.rx, txTotal: current.tx };
  const seconds = (now - previous.at) / 1000;
  return {
    rx: Math.max(0, Math.round((current.rx - previous.rx) / seconds)),
    tx: Math.max(0, Math.round((current.tx - previous.tx) / seconds)),
    rxTotal: current.rx,
    txTotal: current.tx
  };
}

export function systemStatus() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const load = os.loadavg()[0];
  const net = networkRate();
  return {
    hostname: os.hostname(),
    uptime: os.uptime(),
    processUptime: process.uptime(),
    memoryTotal: totalMem,
    memoryUsed: totalMem - freeMem,
    memoryPercent: totalMem ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0,
    cpuPercent: Math.max(0, Math.min(100, Math.round((load / Math.max(os.cpus().length, 1)) * 100))),
    cpuCores: os.cpus().length,
    networkRx: net.rx,
    networkTx: net.tx,
    networkRxTotal: net.rxTotal,
    networkTxTotal: net.txTotal,
    time: new Date().toISOString(),
    node: process.version
  };
}
