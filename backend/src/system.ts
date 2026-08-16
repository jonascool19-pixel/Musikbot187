import os from "node:os";
import { readFile } from "node:fs/promises";

export function systemInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  return { hostname: os.hostname(), platform: process.platform, arch: process.arch, node: process.version, deno: process.env.DENO_VERSION || "managed by installer", cores: os.cpus().length, load: os.loadavg(), ram: { total, free, used: total - free }, uptime: os.uptime() };
}

export async function networkInfo(selected: string) {
  const interfaces: Array<{ name: string; rx: number; tx: number; addresses: string[] }> = [];
  const all = os.networkInterfaces() as Record<string, any[] | undefined>;
  for (const [name, addresses] of Object.entries(all)) {
    const rxText = await readFile(`/sys/class/net/${name}/statistics/rx_bytes`, "utf8").catch(() => "0");
    const txText = await readFile(`/sys/class/net/${name}/statistics/tx_bytes`, "utf8").catch(() => "0");
    interfaces.push({ name, rx: Number(rxText.trim()) || 0, tx: Number(txText.trim()) || 0, addresses: (addresses || []).map((entry: any) => entry.address) });
  }
  return { selected, interfaces };
}
