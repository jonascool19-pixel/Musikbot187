import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { FFMPEG } from "./config.js";
import { resolveStream } from "./media.js";
import type { AppState, MediaItem, PlaybackMode } from "./types.js";
import { recordDiagnostic } from "./logger.js";

export class Player extends EventEmitter {
  private queue: MediaItem[] = [];
  private current: MediaItem | null = null;
  private paused = false;
  private ffmpeg?: ChildProcessWithoutNullStreams;
  private generation = 0;
  private volume = 80;
  private mode: PlaybackMode = "queue";
  private previous: MediaItem | null = null;
  constructor(private state: AppState) { super(); this.volume = state.settings.volume; this.mode = state.settings.mode; }
  setMode(mode: PlaybackMode): void { this.mode = mode; this.state.settings.mode = mode; this.emit("state"); }
  setVolume(value: number): void { this.volume = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 80)); this.state.settings.volume = this.volume; this.emit("state"); }
  async enqueue(items: MediaItem[]): Promise<void> { this.queue.push(...items.map((item) => ({ ...item, id: item.id || crypto.randomUUID() }))); if (!this.current) await this.next(); this.emit("state"); }
  pause(): void { if (this.ffmpeg && !this.paused) { this.ffmpeg.kill("SIGSTOP"); this.paused = true; this.emit("state"); } }
  resume(): void { if (this.ffmpeg && this.paused) { this.ffmpeg.kill("SIGCONT"); this.paused = false; this.emit("state"); } }
  stop(): void { this.stopProcess(); this.current = null; this.previous = null; this.paused = false; this.emit("state"); }
  skip(): void { this.stopProcess(); void this.next(); }
  async removeQueue(index: number): Promise<void> { if (index >= 0 && index < this.queue.length) this.queue.splice(index, 1); this.emit("state"); }
  clearQueue(): void { this.queue = []; this.emit("state"); }
  private nextItem(): MediaItem | null { if (!this.queue.length) return null; if (this.mode === "shuffle") return this.queue.splice(Math.floor(Math.random() * this.queue.length), 1)[0] || null; return this.queue.shift() || null; }
  async next(): Promise<void> {
    this.stopProcess();
    const myGeneration = this.generation;
    if (this.mode === "repeat" && this.current) this.previous = this.current; else { this.previous = this.current; this.current = this.nextItem(); }
    this.paused = false; this.emit("state"); if (!this.current) return;
    try {
      const url = await resolveStream(this.current, this.state.integration);
      if (myGeneration !== this.generation || !this.current) return;
      const child = spawn(FFMPEG, ["-hide_banner","-loglevel","error","-reconnect","1","-reconnect_streamed","1","-reconnect_delay_max","5","-i",url,"-vn","-f","s16le","-ar","48000","-ac","2","pipe:1"]);
      this.ffmpeg = child;
      child.stdout.on("data", (data: Buffer) => this.emit("audio", this.applyVolume(data)));
      child.stderr.on("data", (data: Buffer) => { const text=data.toString().trim(); if(text) this.emit("diagnostic", text); });
      child.on("error", (error: Error) => this.emit("diagnostic", `FFmpeg: ${error.message}`));
      child.on("close", () => { if (myGeneration !== this.generation) return; this.ffmpeg = undefined; if (this.current && !this.paused) void this.next(); });
    } catch (error) {
      recordDiagnostic(this.state, `Wiedergabefehler bei ${this.current.title}: ${error instanceof Error ? error.message : String(error)}`);
      this.current = null; if (myGeneration === this.generation) await this.next();
    }
  }
  private applyVolume(buffer: Buffer): Buffer { if (this.volume >= 100) return buffer; if (this.volume <= 0) return Buffer.alloc(buffer.length); const factor=this.volume/100; const output=Buffer.from(buffer); for(let offset=0;offset+1<output.length;offset+=2){const value=output.readInt16LE(offset);output.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(value*factor))),offset);} return output; }
  private stopProcess(): void { this.generation++; if (this.ffmpeg) { this.ffmpeg.kill("SIGTERM"); this.ffmpeg=undefined; } }
  snapshot(){ return { current:this.current, queue:[...this.queue], paused:this.paused, volume:this.volume, mode:this.mode, previous:this.previous }; }
}
