import os from 'node:os';
import { readFile, stat, statfs } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export function calculateCpuPercent(usedSeconds, elapsedSeconds, cpuCount) {
  const cores = Math.max(0.01, Number(cpuCount) || 1);
  if (!(elapsedSeconds > 0) || !(usedSeconds >= 0) || !Number.isFinite(elapsedSeconds) || !Number.isFinite(usedSeconds)) return 0;
  return Math.min(100, Math.max(0, (usedSeconds / elapsedSeconds / cores) * 100));
}

function cpuCapacity() {
  try {
    const raw = readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim().split(/\s+/);
    if (raw[0] !== 'max') {
      const quota = Number(raw[0]);
      const period = Number(raw[1]);
      if (quota > 0 && period > 0) return quota / period;
    }
  } catch {}
  return Math.max(1, os.cpus().length);
}

const CPU_CAPACITY = cpuCapacity();
const HOST_CPUS = os.cpus().length;
const lastNetwork = new Map();
const linkSpeedCache = new Map();
const networkCache = new Map();
const NETWORK_CACHE_MS = 750;
const LINK_SPEED_CACHE_MS = 15_000;

function cpuUsage() {
  try {
    const text = readFileSync('/sys/fs/cgroup/cpu.stat', 'utf8');
    const match = text.match(/^usage_usec\s+(\d+)/m);
    return match ? Number(match[1]) / 1e6 : null;
  } catch { return null; }
}

function memoryInfo() {
  try {
    const current = Number(readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim());
    const maxRaw = readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    const limit = maxRaw === 'max' ? os.totalmem() : Number(maxRaw);
    if (Number.isFinite(current) && Number.isFinite(limit) && limit > 0) return { total: limit, used: Math.min(current, limit), free: Math.max(0, limit - current), percent: Number((current / limit * 100).toFixed(1)) };
  } catch {}
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return { total, free, used, percent: Number((used / total * 100).toFixed(1)) };
}

export function selectNetworkInterfaces(interfaces, selectedName = '') {
  if (!selectedName) return interfaces;
  const selected = interfaces.find(x => x.name === selectedName);
  return selected ? [selected] : [];
}

function parseProcNetDev(text) {
  const interfaces = [];
  for (const line of String(text).split('\n')) {
    const match = line.match(/^\s*([^:]+):\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
    if (!match) continue;
    interfaces.push({ name: match[1].trim(), rxBytes: Number(match[2]), txBytes: Number(match[3]) });
  }
  return interfaces;
}

let lastCpu = cpuUsage();
let lastTime = process.hrtime.bigint();

export function systemInfo() {
  const now = process.hrtime.bigint();
  const currentUsage = cpuUsage();
  const elapsed = Number(now - lastTime) / 1e9;
  const used = currentUsage !== null && lastCpu !== null ? Math.max(0, currentUsage - lastCpu) : 0;
  const cpuPercent = calculateCpuPercent(used, elapsed, CPU_CAPACITY);
  lastCpu = currentUsage;
  lastTime = now;
  const memory = memoryInfo();
  return {
    hostname: os.hostname(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    uptime: os.uptime(),
    cpus: CPU_CAPACITY,
    hostCpus: HOST_CPUS,
    cpuPercent: Number(cpuPercent.toFixed(1)),
    memory,
    load: os.loadavg()
  };
}

async function linkSpeedMbps(name) {
  const cached = linkSpeedCache.get(name);
  const now = Date.now();
  if (cached && now - cached.time < LINK_SPEED_CACHE_MS) return cached.value;
  let value = 0;
  try {
    value = Number((await readFile(`/sys/class/net/${name}/speed`, 'utf8')).trim());
    if (!Number.isFinite(value) || value <= 0) value = 0;
  } catch {}
  linkSpeedCache.set(name, { time: now, value });
  return value;
}

export async function networkInfo(selectedName = '') {
  const cacheKey = selectedName || '*';
  const cached = networkCache.get(cacheKey);
  const nowMs = Date.now();
  if (cached && nowMs - cached.time < NETWORK_CACHE_MS) return cached.value;

  const promise = (async () => {
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

    const interfaces = [];
    const speeds = await Promise.all(selectedAddresses.map(async item => ({ name: item.name, value: await linkSpeedMbps(item.name) })));
    const speedMap = new Map(speeds.map(x => [x.name, x.value]));
    let totalLinkMbps = 0;
    for (const item of selectedAddresses) {
      const stat = traffic.find(x => x.name === item.name);
      const linkMbps = speedMap.get(item.name) || 0;
      totalLinkMbps += linkMbps;
      interfaces.push({ ...item, rxBytes: stat?.rxBytes || 0, txBytes: stat?.txBytes || 0, linkSpeedMbps: linkMbps });
    }

    const capacityBps = totalLinkMbps * 1000000 / 8;
    const rxUtilizationPercent = capacityBps > 0 ? Math.min(100, Number((rxBytesPerSecond / capacityBps * 100).toFixed(2))) : null;
    const txUtilizationPercent = capacityBps > 0 ? Math.min(100, Number((txBytesPerSecond / capacityBps * 100).toFixed(2))) : null;
    const totalUtilizationPercent = capacityBps > 0 ? Math.min(100, Number(((rxBytesPerSecond + txBytesPerSecond) / capacityBps * 100).toFixed(2))) : null;

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
  })();

  networkCache.set(cacheKey, { time: nowMs, value: promise });
  try { return await promise; } catch (error) { networkCache.delete(cacheKey); throw error; }
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
