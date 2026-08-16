import os from "node:os";
import { readFile } from "node:fs/promises";

async function stat(name: string, file: string): Promise<number> {
  return Number((await readFile(`/sys/class/net/${name}/statistics/${file}`, "utf8").catch(() => "0")).trim()) || 0;
}

async function speedMbps(name: string): Promise<number> {
  const value = Number((await readFile(`/sys/class/net/${name}/speed`, "utf8").catch(() => "0")).trim());
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export async function networkInfo(selected: string) {
  const interfaces = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    interfaces.push({ name, rx: await stat(name, "rx_bytes"), tx: await stat(name, "tx_bytes"), speedMbps: await speedMbps(name), addresses: (addrs || []).map((x) => x.address) });
  }
  return { selected, interfaces };
}

export function systemInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  return { hostname: os.hostname(), node: process.version, cores: os.cpus().length, load: os.loadavg(), ram: { total, free, used: total - free }, uptime: os.uptime() };
}
