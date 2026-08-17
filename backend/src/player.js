import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { validatePlaybackItem, revalidatePlaybackTarget, validateResolvedMediaUrl } from "./source-policy.js";

const YTDLP = process.env.MUSIKBOT187_YTDLP || "yt-dlp";
const FFMPEG = process.env.MUSIKBOT187_FFMPEG || "ffmpeg";
const RECOVERY_DELAYS = [2000, 5000, 10000, 20000];
const MAX_QUEUE_ITEMS = 100;
const MAX_RESOLVER_OUTPUT = 1024 * 1024;
function clampVolume(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0; }
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export class Player extends EventEmitter {
  queue = [];
  current = null;
  paused = false;
  volume;
  mode;
  ff = null;
  resolver = null;
  generation = 0;
  spawnFn;
  settings;
  constructor(settings, { spawnFn = spawn } = {}) { super(); this.settings = settings; this.volume = clampVolume(settings.volume ?? 80); this.mode = ["queue", "repeat", "shuffle"].includes(settings.mode) ? settings.mode : "queue"; this.spawnFn = spawnFn; }
  get dataDirectory() { return this.settings.filesDirectory; }
  snapshot() { return { queue: this.queue, current: this.current, paused: this.paused, volume: this.volume, mode: this.mode }; }
  setVolume(value) {
    const next = clampVolume(value);
    if (next === this.volume) return;
    this.volume = next;
    if (this.ff && this.current) {
      const current = this.current;
      const wasPaused = this.paused;
      this.generation++;
      try { this.ff.kill("SIGTERM"); } catch {}
      this.ff = null;
      if (this.queue.length < MAX_QUEUE_ITEMS) this.queue.unshift(current);
      this.current = null;
      this.paused = wasPaused;
      void this.next();
    }
  }
  setMode(mode) { if (["queue", "repeat", "shuffle"].includes(mode)) this.mode = mode; }
  pause() { this.paused = true; if (this.ff) try { this.ff.kill("SIGSTOP"); } catch {} }
  resume() { this.paused = false; if (this.ff) try { this.ff.kill("SIGCONT"); } catch {} }
  stop() { this.generation++; if (this.resolver) try { this.resolver.kill("SIGTERM"); } catch {}; if (this.ff) try { this.ff.kill("SIGTERM"); } catch {}; this.resolver = null; this.ff = null; this.queue = []; this.current = null; this.paused = false; this.emit("state"); }
  async shutdown() { this.stop(); await new Promise(resolve => setImmediate(resolve)); }
  skip() { this.generation++; if (this.resolver) { try { this.resolver.kill("SIGTERM"); } catch {}; this.resolver = null; void this.next(); } else if (this.ff) { const old = this.ff; this.ff = null; try { old.kill("SIGTERM"); } catch {}; void this.next(); } else if (this.current) void this.next(); }
  clear() { this.queue = []; this.emit("state"); }
  async remove(index) { if (Number.isInteger(index) && index >= 0 && index < this.queue.length) this.queue.splice(index, 1); this.emit("state"); }
  async enqueue(items) {
    const clean = Array.isArray(items) ? items.filter(x => x && typeof x.url === "string" && x.url.trim()).slice(0, Math.max(0, MAX_QUEUE_ITEMS - this.queue.length)) : [];
    const validated = [];
    for (const item of clean) validated.push(await validatePlaybackItem(item, this.dataDirectory));
    this.queue.push(...validated);
    if (!this.current) void this.next(); else this.emit("state");
  }
  async resolve(item) {
    const input = String(item.url);
    if (item.source === "radio" || item.source === "file" || item.source === "direct") return input;
    const args = ["-g", "-f", "bestaudio/best", "--no-playlist", "--no-warnings"];
    if (item.source === "spotify" || input.startsWith("ytsearch")) args.push("--default-search", "ytsearch1");
    args.push(input);
    const p = this.spawnFn(YTDLP, args, { stdio: ["ignore", "pipe", "pipe"] });
    this.resolver = p;
    let out = "", err = "", settled = false;
    await new Promise((resolve, reject) => {
      const finish = (fn, value) => { if (settled) return; settled = true; clearTimeout(timer); fn(value); };
      const timer = setTimeout(() => { try { p.kill("SIGTERM"); } catch {} finish(reject, new Error("Zeitüberschreitung beim Auflösen der Audioquelle")); }, 30000);
      p.stdout.on("data", d => { if (settled) return; out += String(d); if (Buffer.byteLength(out, "utf8") > MAX_RESOLVER_OUTPUT) { try { p.kill("SIGTERM"); } catch {}; finish(reject, new Error("Aufgelöste Medienquelle ist zu groß")); } });
      p.stderr.on("data", d => { err += String(d); if (err.length > 256000) err = err.slice(-256000); });
      p.on("error", e => finish(reject, e));
      p.on("close", code => code === 0 ? finish(resolve) : finish(reject, new Error(err.trim() || "yt-dlp konnte die Quelle nicht öffnen")));
    });
    if (this.resolver === p) this.resolver = null;
    const url = out.trim().split(/\r?\n/)[0];
    if (!url) throw new Error("yt-dlp hat keine abspielbare URL geliefert");
    await validateResolvedMediaUrl(url);
    return url;
  }
  async playSource(item, run) {
    await revalidatePlaybackTarget(item, this.dataDirectory);
    const source = await this.resolve(item);
    if (run !== this.generation) return "cancelled";
    if (item.source === "direct" || item.source === "radio") await revalidatePlaybackTarget(item, this.dataDirectory);
    if (item.source === "file") await revalidatePlaybackTarget(item, this.dataDirectory);
    const ff = this.spawnFn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-nostdin", "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_at_eof", "1", "-reconnect_on_network_error", "1", "-reconnect_on_http_error", "4xx,5xx", "-reconnect_delay_max", "5", "-i", source, "-vn", "-f", "s16le", "-ar", "48000", "-ac", "2", "-af", `volume=${this.volume / 100}`, "pipe:1"], { stdio: ["ignore", "pipe", "pipe"] });
    this.ff = ff;
    if (this.paused) { try { ff.kill("SIGSTOP"); } catch {} }
    ff.stdout.on("data", d => { if (run === this.generation && this.ff === ff) this.emit("audio", Buffer.from(d)); });
    ff.stderr.on("data", d => { if (run !== this.generation || this.ff !== ff) return; const message = String(d).trim(); if (message) this.emit("diagnostic", message.slice(0, 1000)); });
    const code = await new Promise(resolve => { ff.on("error", () => resolve(-1)); ff.on("close", code => resolve(code)); });
    if (this.ff === ff) this.ff = null;
    if (run !== this.generation) return "cancelled";
    return code === 0 ? "ended" : "failed";
  }
  async recover(item, run, reason) {
    for (let attempt = 0; attempt < RECOVERY_DELAYS.length; attempt++) {
      if (run !== this.generation) return false;
      const delay = RECOVERY_DELAYS[attempt];
      this.emit("diagnostic", `Audio-Verbindung verloren (${String(reason).slice(0, 300)}). Wiederverbindung in ${Math.round(delay / 1000)}s – Versuch ${attempt + 1}/${RECOVERY_DELAYS.length}.`);
      await wait(delay);
      if (run !== this.generation) return false;
      try {
        const result = await this.playSource(item, run);
        if (result === "ended") return true;
        if (result === "cancelled") return false;
        this.emit("diagnostic", `Wiederverbindungsversuch ${attempt + 1} fehlgeschlagen.`);
      } catch (error) {
        this.emit("diagnostic", `Wiederverbindungsversuch ${attempt + 1} fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`.slice(0, 1000));
      }
    }
    return false;
  }
  async next() {
    if (!this.queue.length) { this.current = null; this.paused = false; this.emit("state"); return; }
    let item = this.queue.shift();
    if (this.mode === "shuffle" && this.queue.length) { const index = Math.floor(Math.random() * (this.queue.length + 1)); if (index < this.queue.length) { const randomItem = this.queue.splice(index, 1)[0]; this.queue.unshift(item); item = randomItem; } }
    this.current = item; this.emit("state");
    const run = ++this.generation;
    try {
      let result;
      try { result = await this.playSource(item, run); }
      catch (error) {
        if (run !== this.generation) return;
        const recovered = await this.recover(item, run, error instanceof Error ? error.message : String(error));
        if (!recovered) throw error;
        result = "ended";
      }
      if (run !== this.generation) return;
      if (result === "failed") {
        const recovered = await this.recover(item, run, "FFmpeg wurde unerwartet beendet");
        if (!recovered) this.emit("diagnostic", "Audio konnte nach mehreren Wiederverbindungsversuchen nicht wiederhergestellt werden.");
      }
      if (run !== this.generation) return;
      if (this.mode === "repeat" && this.queue.length < MAX_QUEUE_ITEMS) this.queue.unshift(item);
      await this.next();
    } catch (error) {
      if (this.resolver) this.resolver = null;
      if (run === this.generation) { this.emit("diagnostic", error instanceof Error ? error.message : String(error)); await this.next(); }
    }
  }
}
