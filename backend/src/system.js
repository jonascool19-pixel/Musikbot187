import os from 'node:os';
import { readFile, readFileSync, stat, statfs } from 'node:fs/promises';
import path from 'node:path';

export function calculateCpuPercent(usedSeconds, elapsedSeconds, cpuCount) {
  const cores = Math.max(1, Number(cpuCount) || 1);
  if (!(elapsedSeconds > 0) || !(usedSeconds >= 0) || !Number.isFinite(elapsedSeconds) || !Number.isFinite(usedSeconds)) return 0;
  return Math.min(100, Math.max(0, (usedSeconds / elapsedSeconds / cores) * 100));
}

function effectiveCpuCount() {
  try {
    const raw = readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim().split(/\s+/);
    if (raw[0] !== 'max') {
      const quota = Number(raw[0]);
      const period = Number(raw[1]);
      if (quota > 0 && period > 0) return Math.max(1, Math.ceil(quota / period));
    }
  } catch {}
  return Math.max(1, os.cpus().length);
}

export function selectNetworkInterfaces(interfaces, selectedName = '') {
  if (!selectedName) return interfaces;
  const selected = interfaces.find(x => x.name === selectedName);
  return selected ? [selected] : [];
}

function parseProcNetDev(text) {
  const interfaces = [];
  for (const line of String(text).split('\n')) {
    const match = line.match(/^\s*([^:]+):\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
    if (!match) continue;
    interfaces.push({ name: match[1].trim(), rxBytes: Number(match[2]), txBytes: Number(match[3]) });
  }
  return interfaces;
}

let lastCpu = process.cpuUsage();
let lastTime = process.hrtime.bigint();
const lastNetwork = new Map();

export function systemInfo() {
  const now = process.hrtime.bigint();
  const cpu = process.cpuUsage();
  const elapsed = Number(now - lastTime) / 1e9;
  const used = (cpu.user - lastCpu.user + cpu.system - lastCpu.system) / 1e6;
  const cpuPercent = calculateCpuPercent(used, elapsed, effectiveCpuCount());
  lastCpu = cpu;
  lastTime = now;
  const total = os.totalmem();
  const free = os.freemem();
  const usedMem = total - free;
  return {
    hostname: os.hostname(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    uptime: os.uptime(),
    cpus: effectiveCpuCount(),
    hostCpus: os.cpus().length,
    cpuPercent: Number(cpuPercent.toFixed(1)),
    memory: { total, free, used: usedMem, percent: Number((usedMem / total * 100).toFixed(1)) },
    load: os.loadavg()
  };
}

export async function networkInfo(selectedName = '') {
  let traffic = [];
  try { traffic = parseProcNetDev(await readFile('/proc/net/dev', 'utf8')); } catch {}
  const now = process.hrtime.bigint();
  const addresses = Object.entries(os.networkInterfaces()).map(([name, values]) => ({
    name,
    addresses: (values || []).map(v => ({ address: v.address, family: v.family, internal: v.internal }))
  }));
  const selectedAddresses = selectNetworkInterfaces(addresses, selectedName);
  const selectedNames = new Set(selectedAddresses.map(x => x.name));
  const measuredTraffic = selectedName ? traffic.filter(x => selectedNames.has(x.name)) : traffic;
  const totalRxBytes = measuredTraffic.reduce((sum, x) => sum + x.rxBytes, 0);
  const totalTxBytes = measuredTraffic.reduce((sum, x) => sum + x.txBytes, 0);
  const key = selectedName || '*';
  const previous = lastNetwork.get(key);
  const elapsed = previous ? Math.max(0.001, Number(now - previous.time) / 1e9) : 0;
  const rxBytesPerSecond = previous ? Math.max(0, (totalRxBytes - previous.rxBytes) / elapsed) : 0;
  const txBytesPerSecond = previous ? Math.max(0, (totalTxBytes - previous.txBytes) / elapsed) : 0;
  lastNetwork.set(key, { time: now, rxBytes: totalRxBytes, txBytes: totalTxBytes });

  let totalLinkMbps = 0;
  const interfaces = [];
  for (const item of selectedAddresses) {
    const stat = traffic.find(x => x.name === item.name);
    let linkMbps = 0;
    try {
      linkMbps = Number((await readFile(`/sys/class/net/${item.name}/speed`, 'utf8')).trim());
      if (!Number.isFinite(linkMbps) || linkMbps <= 0) linkMbps = 0;
    } catch {}
    totalLinkMbps += linkMbps;
    interfaces.push({ ...item, rxBytes: stat?.rxBytes || 0, txBytes: stat?.txBytes || 0, linkSpeedMbps: linkMbps });
  }

  const capacityBps = totalLinkMbps * 1000000 / 8;
  const rxUtilizationPercent = capacityBps > 0 ? Math.min(100, Number((rxBytesPerSecond / capacityBps * 100).toFixed(2))) : null;
  const txUtilizationPercent = capacityBps > 0 ? Math.min(100, Number((txBytesPerSecond / capacityBps * 100).toFixed(2))) : null;
  const totalUtilizationPercent = capacityBps > 0 ? Math.min(100, Number((rxUtilizationPercent + txUtilizationPercent).toFixed(2))) : null;

  return {
    hostname: os.hostname(),
    interfaces,
    totalRxBytes,
    totalTxBytes,
    rxBytesPerSecond,
    txBytesPerSecond,
    rxUtilizationPercent,
    txUtilizationPercent,
    totalUtilizationPercent,
    linkSpeedMbps: totalLinkMbps || null,
    measuredSeconds: elapsed
  };
}

export async function storageInfo(dir) {
  try {
    const resolved = path.resolve(dir);
    const s = await stat(resolved);
    const fs = await statfs(resolved);
    const total = Number(fs.blocks) * Number(fs.bsize);
    const free = Number(fs.bavail) * Number(fs.bsize);
    const used = Math.max(0, total - free);
    return { path: resolved, exists: true, directory: s.isDirectory(), disk: { total, free, used, percent: total ? Number((used / total * 100).toFixed(1)) : 0 } };
  } catch {
    return { path: path.resolve(dir), exists: false, directory: false, disk: null };
  }
}
