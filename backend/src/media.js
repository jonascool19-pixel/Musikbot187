import { spawn } from "node:child_process";

async function json(url, init) {
  const response = await fetch(url, { ...init, signal: init?.signal || AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function runYtdlp(args, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const p = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
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
    p.stdout.on("data", d => { out += d; });
    p.stderr.on("data", d => { err += d; });
    p.on("error", e => finish(reject, e));
    p.on("close", c => c === 0 ? finish(resolve, out) : finish(reject, new Error(err.trim() || "yt-dlp Suche fehlgeschlagen")));
  });
}

export async function youtubeSearch(q) {
  const out = await runYtdlp(["--flat-playlist", "--dump-single-json", "--skip-download", `ytsearch20:${q}`]);
  let data;
  try { data = JSON.parse(out); } catch { throw new Error("yt-dlp lieferte ungültige Suchdaten"); }
  return (data.entries || []).slice(0, 20).map((x) => ({ id: String(x.id), title: String(x.title), url: String(x.webpage_url || x.url || `https://www.youtube.com/watch?v=${x.id}`), source: "youtube", thumbnail: x.thumbnail, duration: x.duration }));
}

export async function radioSearch(q) {
  const rows = await json(`https://de1.api.radio-browser.info/json/stations/search?limit=18&order=votes&reverse=true&hidebroken=true&name=${encodeURIComponent(q)}`);
  return rows.slice(0, 18).map((x) => ({ id: `radio:${x.stationuuid}`, title: String(x.name), url: String(x.url_resolved || x.url), source: "radio", thumbnail: x.favicon }));
}

export async function spotifySearch(q, settings) {
  if (!settings.spotifyClientId || !settings.spotifyClientSecret) return [];
  const basic = Buffer.from(`${settings.spotifyClientId}:${settings.spotifyClientSecret}`).toString("base64");
  const token = await json("https://accounts.spotify.com/api/token", { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  const result = await json(`https://api.spotify.com/v1/search?type=track&limit=20&q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token.access_token}` } });
  return (result.tracks?.items || []).slice(0, 20).map((x) => ({ id: `spotify:${x.id}`, title: String(x.name), artist: x.artists?.map((a) => a.name).join(", "), url: `ytsearch1:${x.name} ${x.artists?.[0]?.name || ""}`, source: "spotify", thumbnail: x.album?.images?.[0]?.url, duration: Math.round((x.duration_ms || 0) / 1000) }));
}
