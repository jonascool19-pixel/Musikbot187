import dns from "node:dns/promises";
import net from "node:net";
import path from "node:path";
import { realpath } from "node:fs/promises";

function ipv4ToNumber(value) {
  const parts = String(value).split('.').map(Number);
  if (parts.length !== 4 || parts.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return null;
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]);
}
function blockedIpv4(address) {
  const n = ipv4ToNumber(address);
  if (n === null) return true;
  const ranges = [
    ['0.0.0.0', '0.255.255.255'], ['10.0.0.0', '10.255.255.255'], ['100.64.0.0', '100.127.255.255'], ['127.0.0.0', '127.255.255.255'],
    ['169.254.0.0', '169.254.255.255'], ['172.16.0.0', '172.31.255.255'], ['192.0.0.0', '192.0.0.255'], ['192.0.2.0', '192.0.2.255'],
    ['192.168.0.0', '192.168.255.255'], ['198.18.0.0', '198.19.255.255'], ['198.51.100.0', '198.51.100.255'], ['203.0.113.0', '203.0.113.255'],
    ['224.0.0.0', '255.255.255.255']
  ];
  return ranges.some(([start, end]) => { const a = ipv4ToNumber(start); const b = ipv4ToNumber(end); return n >= a && n <= b; });
}
function blockedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return blockedIpv4(address);
  if (family !== 6) return true;
  let normalized = String(address).toLowerCase();
  if (normalized.includes('%')) normalized = normalized.split('%')[0];
  if (normalized.startsWith('::ffff:')) return true;
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized) || normalized.startsWith('ff');
}

async function resolvePublicHost(hostname, label) {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some(record => blockedAddress(record.address))) throw new Error(`${label}-URL zeigt auf ein nicht erlaubtes Netzwerkziel`);
  const second = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!second.length || second.some(record => blockedAddress(record.address))) throw new Error(`${label}-URL zeigt auf ein nicht erlaubtes Netzwerkziel`);
  const firstSet = new Set(records.map(record => record.address));
  const secondSet = new Set(second.map(record => record.address));
  if (firstSet.size !== secondSet.size || [...firstSet].some(address => !secondSet.has(address))) throw new Error(`${label}-URL hat eine instabile DNS-Auflösung`);
  return [...firstSet];
}

async function rejectRedirect(value, label, allowRedirect = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(value, { method: "HEAD", redirect: "manual", signal: controller.signal });
    if (response.status >= 300 && response.status < 400 && !allowRedirect) throw new Error(`${label}-URL darf nicht umleiten`);
  } catch (error) {
    if (error instanceof Error && (error.message.includes("darf nicht umleiten") || error.name === "AbortError")) {
      if (error.message.includes("darf nicht umleiten")) throw error;
      return;
    }
    return;
  } finally { clearTimeout(timer); }
}

async function validateHttpTarget(value, label, { allowRedirect = false } = {}) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`Ungültige ${label}-URL`); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(`${label}-URL muss HTTP(S) ohne Zugangsdaten sein`);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || (net.isIP(hostname) && blockedAddress(hostname))) throw new Error(`${label}-URL zeigt auf ein nicht erlaubtes Netzwerkziel`);
  if (!net.isIP(hostname)) await resolvePublicHost(hostname, label);
  await rejectRedirect(parsed.toString(), label, allowRedirect);
}

export async function validatePlaybackItem(item, dataDirectory) {
  if (!item || typeof item.url !== "string" || !item.url.trim()) throw new Error("Ungültige Audioquelle");
  const source = String(item.source || "youtube").toLowerCase();
  const value = item.url.trim();
  if (value.length > 4096) throw new Error("Audioquelle ist zu lang");
  if (!["youtube", "radio", "spotify", "direct", "file"].includes(source)) throw new Error("Nicht unterstützte Audioquelle");
  if (source === "file") {
    const root = await realpath(path.resolve(dataDirectory));
    const target = await realpath(path.resolve(root, value));
    const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (target !== root && !target.startsWith(prefix)) throw new Error("Datei liegt außerhalb des Musikverzeichnisses");
    return { ...item, source, url: path.relative(root, target) || path.basename(target) };
  }
  if (source === "direct" || source === "radio") {
    await validateHttpTarget(value, source === "radio" ? "Radio" : "Direkte Audio", { allowRedirect: source === "radio" });
    return { ...item, source, url: value };
  }
  if (source === "youtube") {
    if (/^ytsearch\d*:/i.test(value)) return { ...item, source, url: value.slice(0, 512) };
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error("Ungültige YouTube-URL"); }
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!["youtube.com", "youtu.be", "music.youtube.com"].includes(hostname) || parsed.username || parsed.password) throw new Error("Nicht erlaubte YouTube-Quelle");
    return { ...item, source, url: value };
  }
  if (!/^ytsearch\d*:/i.test(value) && !/^spotify:/i.test(value)) throw new Error("Nicht erlaubte Spotify-Quelle");
  return { ...item, source, url: value.slice(0, 512) };
}

export async function revalidatePlaybackTarget(item, dataDirectory) {
  if (item?.source === "direct" || item?.source === "radio") await validateHttpTarget(String(item.url), item.source === "radio" ? "Radio" : "Direkte Audio", { allowRedirect: item.source === "radio" });
  if (item?.source === "file") await validatePlaybackItem(item, dataDirectory);
}

export async function validateResolvedMediaUrl(value) {
  await validateHttpTarget(value, "Aufgelöste Medienquelle");
  return value;
}
