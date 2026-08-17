import dns from "node:dns/promises";
import net from "node:net";
import path from "node:path";

const BLOCKED_IPV4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[0-1])\./, /^192\.0\.0\./, /^192\.0\.2\./, /^198\.(18|19)\./, /^198\.51\.100\./, /^203\.0\.113\./, /^224\./, /^240\./];

function blockedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return BLOCKED_IPV4.some(rule => rule.test(address));
  if (family !== 6) return true;
  const normalized = address.toLowerCase();
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized) || normalized.startsWith("ff");
}

export async function validatePlaybackItem(item, dataDirectory) {
  if (!item || typeof item.url !== "string" || !item.url.trim()) throw new Error("Ungültige Audioquelle");
  const source = String(item.source || "youtube").toLowerCase();
  const value = item.url.trim();
  if (!["youtube", "radio", "spotify", "direct", "file"].includes(source)) throw new Error("Nicht unterstützte Audioquelle");
  if (source === "file") {
    const root = path.resolve(dataDirectory);
    const target = path.resolve(root, value);
    const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (target !== root && !target.startsWith(prefix)) throw new Error("Datei liegt außerhalb des Musikverzeichnisses");
    return { ...item, source, url: target };
  }
  if (source === "direct") {
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error("Ungültige direkte Audio-URL"); }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port) throw new Error("Direkte Audio-URL muss HTTP(S) ohne Zugangsdaten oder Sonderport sein");
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || (net.isIP(hostname) && blockedAddress(hostname))) throw new Error("Direkte Audio-URL zeigt auf ein nicht erlaubtes Netzwerkziel");
    try {
      const records = await dns.lookup(hostname, { all: true, verbatim: true });
      if (!records.length || records.some(record => blockedAddress(record.address))) throw new Error("Direkte Audio-URL zeigt auf ein nicht erlaubtes Netzwerkziel");
    } catch (error) {
      if (error instanceof Error && error.message.includes("nicht erlaubtes Netzwerkziel")) throw error;
      throw new Error("Direkte Audio-URL konnte nicht sicher geprüft werden");
    }
  }
  return { ...item, source, url: value };
}
