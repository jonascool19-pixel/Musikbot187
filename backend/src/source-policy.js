import dns from "node:dns/promises";
import net from "node:net";
import path from "node:path";
import { realpath } from "node:fs/promises";

const BLOCKED_IPV4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[0-1])\./, /^192\.0\.0\./, /^192\.0\.2\./, /^198\.(18|19)\./, /^198\.51\.100\./, /^203\.0\.113\./, /^224\./, /^240\./];

function blockedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return BLOCKED_IPV4.some(rule => rule.test(address));
  if (family !== 6) return true;
  const normalized = address.toLowerCase();
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized) || normalized.startsWith("ff");
}

async function validateHttpTarget(value, label) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`Ungültige ${label}-URL`); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(`${label}-URL muss HTTP(S) ohne Zugangsdaten sein`);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || (net.isIP(hostname) && blockedAddress(hostname))) throw new Error(`${label}-URL zeigt auf ein nicht erlaubtes Netzwerkziel`);
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!records.length || records.some(record => blockedAddress(record.address))) throw new Error(`${label}-URL zeigt auf ein nicht erlaubtes Netzwerkziel`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("nicht erlaubtes Netzwerkziel")) throw error;
    throw new Error(`${label}-URL konnte nicht sicher geprüft werden`);
  }
}

export async function validatePlaybackItem(item, dataDirectory) {
  if (!item || typeof item.url !== "string" || !item.url.trim()) throw new Error("Ungültige Audioquelle");
  const source = String(item.source || "youtube").toLowerCase();
  const value = item.url.trim();
  if (!["youtube", "radio", "spotify", "direct", "file"].includes(source)) throw new Error("Nicht unterstützte Audioquelle");
  if (source === "file") {
    const root = await realpath(path.resolve(dataDirectory));
    const target = await realpath(path.resolve(root, value));
    const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (target !== root && !target.startsWith(prefix)) throw new Error("Datei liegt außerhalb des Musikverzeichnisses");
    return { ...item, source, url: target };
  }
  if (source === "direct" || source === "radio") {
    await validateHttpTarget(value, source === "radio" ? "Radio" : "Direkte Audio");
    return { ...item, source, url: value };
  }
  if (source === "youtube") {
    if (/^ytsearch\d*:/i.test(value)) return { ...item, source, url: value };
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error("Ungültige YouTube-URL"); }
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!["youtube.com", "youtu.be", "music.youtube.com"].includes(hostname) || parsed.username || parsed.password) throw new Error("Nicht erlaubte YouTube-Quelle");
    return { ...item, source, url: value };
  }
  if (!/^ytsearch\d*:/i.test(value) && !/^spotify:/i.test(value)) throw new Error("Nicht erlaubte Spotify-Quelle");
  return { ...item, source, url: value };
}

export async function revalidatePlaybackTarget(item, dataDirectory) {
  if (item?.source === "direct" || item?.source === "radio") await validateHttpTarget(String(item.url), item.source === "radio" ? "Radio" : "Direkte Audio");
  if (item?.source === "file") await validatePlaybackItem(item, dataDirectory);
}