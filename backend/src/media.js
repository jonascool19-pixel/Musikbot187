import { spawn } from "node:child_process";
import { decryptSecret } from "./secrets.js";

const MAX_YTDLP_STDOUT = 4 * 1024 * 1024;
const MAX_YTDLP_STDERR = 512 * 1024;

async function json(url, init) {
  const response = await fetch(url, { ...init, signal: init?.signal || AbortSignal.timeout(15000), redirect: "error" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function runYtdlp(args, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const p = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let out = "", err = "", settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { p.kill("SIGTERM"); } catch {}
      reject(new Error("yt-dlp Suche hat das Zeitlimit überschritten"));
    }, timeoutMs);
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    p.stdout.on("data", d => {
      if (settled) return;
      out += String(d);
      if (Buffer.byteLength(out, "utf8") > MAX_YTDLP_STDOUT) {
        try { p.kill("SIGTERM"); } catch {}
        finish(reject, new Error("yt-dlp Suchausgabe ist zu groß"));
      }
    });
    p.stderr.on("data", d => {
      if (settled) return;
      err += String(d);
      if (Buffer.byteLength(err, "utf8") > MAX_YTDLP_STDERR) err = err.slice(-MAX_YTDLP_STDERR);
    });
    p.on("error", e => finish(reject, e));
    p.on("close", c => c === 0 ? finish(resolve, out) : finish(reject, new Error(err.trim() || "yt-dlp Suche fehlgeschlagen")));
  });
}

export async function youtubeSearch(q) {
  const query = String(q || "").trim().slice(0, 200);
  if (!query) return [];
  const out = await runYtdlp(["--flat-playlist", "--dump-single-json", "--skip-download", `ytsearch20:${query}`]);
  let data;
  try { data = JSON.parse(out); } catch { throw new Error("yt-dlp lieferte ungültige Suchdaten"); }
  return (data.entries || []).slice(0, 20).map((x) => ({ id: String(x.id || ""), title: String(x.title || "").slice(0, 300), url: String(x.webpage_url || x.url || `https://www.youtube.com/watch?v=${x.id}`), source: "youtube", thumbnail: typeof x.thumbnail === "string" ? x.thumbnail : undefined, duration: Number.isFinite(x.duration) ? x.duration : undefined }));
}

export async function radioSearch(q) {
  const query = String(q || "").trim().slice(0, 200);
  if (!query) return [];
  const rows = await json(`https://de1.api.radio-browser.info/json/stations/search?limit=18&order=votes&reverse=true&hidebroken=true&name=${encodeURIComponent(query)}`);
  return Array.isArray(rows) ? rows.slice(0, 18).map((x) => ({ id: `radio:${String(x.stationuuid || "")}`, title: String(x.name || "").slice(0, 300), url: String(x.url_resolved || x.url || "").slice(0, 2000), source: "radio", thumbnail: typeof x.favicon === "string" ? x.favicon : undefined })) : [];
}

export async function spotifySearch(q, settings) {
  if (!settings.spotifyClientId || !settings.spotifyClientSecret) return [];
  const query = String(q || "").trim().slice(0, 200);
  if (!query) return [];
  const clientSecret = await decryptSecret(settings.spotifyClientSecret);
  if (!clientSecret) return [];
  const basic = Buffer.from(`${settings.spotifyClientId}:${clientSecret}`).toString("base64");
  const token = await json("https://accounts.spotify.com/api/token", { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  const result = await json(`https://api.spotify.com/v1/search?type=track&limit=20&q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token.access_token}` } });
  return (result.tracks?.items || []).slice(0, 20).map((x) => ({ id: `spotify:${x.id}`, title: String(x.name || "").slice(0, 300), artist: x.artists?.map((a) => a.name).join(", ").slice(0, 300), url: `ytsearch1:${String(x.name || "").slice(0, 150)} ${String(x.artists?.[0]?.name || "").slice(0, 100)}`, source: "spotify", thumbnail: x.album?.images?.[0]?.url, duration: Math.round((x.duration_ms || 0) / 1000) }));
}
