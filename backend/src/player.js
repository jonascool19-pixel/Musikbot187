import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";

const YTDLP = process.env.MUSIKBOT187_YTDLP || "yt-dlp";
const FFMPEG = process.env.MUSIKBOT187_FFMPEG || "ffmpeg";
function clampVolume(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0; }

export class Player extends EventEmitter {
  queue = [];
  current = null;
  paused = false;
  volume;
  mode;
  ff = null;
  resolver = null;
  generation = 0;
  constructor(settings) { super(); this.volume = clampVolume(settings.volume ?? 80); this.mode = ["queue", "repeat", "shuffle"].includes(settings.mode) ? settings.mode : "queue"; }
  snapshot() { return { queue: this.queue, current: this.current, paused: this.paused, volume: this.volume, mode: this.mode }; }
  setVolume(value) {
    const next = clampVolume(value);
    if (next === this.volume) return;
    this.volume = next;
    if (this.ff && this.current) {
      const current = this.current;
      this.generation++;
      try { this.ff.kill("SIGCONT"); } catch {}
      try { this.ff.kill("SIGTERM"); } catch {}
      this.ff = null;
      this.queue.unshift(current);
      this.current = null;
      this.paused = false;
      void this.next();
    }
  }
  setMode(mode) { if (["queue", "repeat", "shuffle"].includes(mode)) this.mode = mode; }
  pause() { this.paused = true; if (this.ff) try { this.ff.kill("SIGSTOP"); } catch {} }
  resume() { this.paused = false; if (this.ff) try { this.ff.kill("SIGCONT"); } catch {} }
  stop() { this.generation++; if (this.resolver) this.resolver.kill("SIGTERM"); if (this.ff) this.ff.kill("SIGTERM"); this.resolver = null; this.ff = null; this.queue = []; this.current = null; this.paused = false; this.emit("state"); }
  skip() { this.generation++; if (this.resolver) { this.resolver.kill("SIGTERM"); this.resolver = null; void this.next(); } else if (this.ff) { const old = this.ff; this.ff = null; old.kill("SIGTERM"); void this.next(); } else if (this.current) void this.next(); }
  clear() { this.queue = []; this.emit("state"); }
  async remove(index) { if (Number.isInteger(index) && index >= 0 && index < this.queue.length) this.queue.splice(index, 1); this.emit("state"); }
  async enqueue(items) { const clean = Array.isArray(items) ? items.filter(x => x && typeof x.url === "string" && x.url.trim()) : []; this.queue.push(...clean); if (!this.current) await this.next(); else this.emit("state"); }
  async resolve(item) {
    const input = String(item.url);
    if (item.source === "radio" || item.source === "file") return input;
    const args = ["-g", "-f", "bestaudio/best", "--no-playlist"];
    if (item.source === "spotify" || input.startsWith("ytsearch")) args.push("--default-search", "ytsearch1");
    args.push(input);
    const p = spawn(YTDLP, args, { stdio: ["ignore", "pipe", "pipe"] });
    this.resolver = p;
    let out = "", err = "";
    p.stdout.on("data", d => { out += d; });
    p.stderr.on("data", d => { err += d; });
    await new Promise((resolve, reject) => { p.on("error", reject); p.on("close", code => code === 0 ? resolve() : reject(new Error(err.trim() || "yt-dlp konnte die Quelle nicht öffnen"))); });
    if (this.resolver === p) this.resolver = null;
    const url = out.trim().split(/\r?\n/)[0];
    if (!url) throw new Error("yt-dlp hat keine abspielbare URL geliefert");
    return url;
  }
  async next() {
    if (!this.queue.length) { this.current = null; this.emit("state"); return; }
    let item = this.queue.shift();
    if (this.mode === "shuffle" && this.queue.length) { const index = Math.floor(Math.random() * (this.queue.length + 1)); if (index < this.queue.length) { const randomItem = this.queue.splice(index, 1)[0]; this.queue.unshift(item); item = randomItem; } }
    this.current = item; this.paused = false; this.emit("state");
    const run = ++this.generation;
    try {
      const source = await this.resolve(item);
      if (run !== this.generation) return;
      const ff = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5", "-i", source, "-vn", "-f", "s16le", "-ar", "48000", "-ac", "2", "-af", `volume=${this.volume / 100}`, "pipe:1"], { stdio: ["ignore", "pipe", "pipe"] });
      this.ff = ff;
      ff.stdout.on("data", d => this.emit("audio", Buffer.from(d)));
      ff.stderr.on("data", d => { const message = String(d).trim(); if (message) this.emit("diagnostic", message); });
      await new Promise(resolve => { ff.on("error", () => resolve()); ff.on("close", () => resolve()); });
      if (this.ff === ff) this.ff = null;
      if (run !== this.generation) return;
      if (this.mode === "repeat") this.queue.unshift(item);
      await this.next();
    } catch (error) {
      if (this.resolver) this.resolver = null;
      if (run === this.generation) { this.emit("diagnostic", error instanceof Error ? error.message : String(error)); await this.next(); }
    }
  }
}
