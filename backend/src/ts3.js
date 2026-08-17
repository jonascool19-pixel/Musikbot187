import { Client, generateIdentity } from "@honeybbq/teamspeak-client";
import OpusScript from "opusscript";

function address(host, port) {
  const h = String(host || "").trim();
  const p = Number(port || 9987);
  if (/^\[[^\]]+\]:\d+$/.test(h) || /^[^:]+:\d+$/.test(h)) return h;
  if (h.includes(":") && !h.startsWith("[")) return `[${h}]:${p}`;
  return `${h}:${p}`;
}

export class TS3Manager {
  constructor(onDiagnostic = () => {}) {
    this.map = new Map();
    this.pcm = new Map();
    this.lastVoiceError = new Map();
    this.onDiagnostic = onDiagnostic;
    this.encoder = new OpusScript(48000, 2, OpusScript.Application.AUDIO);
  }
  diagnostic(id, message) {
    const key = String(id || "unknown");
    const now = Date.now();
    const last = this.lastVoiceError.get(key) || 0;
    if (now - last >= 5000) {
      this.lastVoiceError.set(key, now);
      this.onDiagnostic(`TS3 ${key}: ${message}`);
    }
  }
  async connect(config) {
    await this.disconnect(config.id);
    if (!config.enabled) throw new Error("Instanz ist ausgeschaltet");
    if (!config.host) throw new Error("TS3-Server fehlt");
    const client = new Client(generateIdentity(8), address(config.host, config.port), config.nickname || "MusikBot187", { serverPassword: config.password || undefined, defaultChannel: config.channel || undefined });
    await client.connect();
    await client.waitConnected(AbortSignal.timeout(15000));
    this.map.set(config.id, client);
    this.pcm.set(config.id, Buffer.alloc(0));
    this.lastVoiceError.delete(config.id);
  }
  async disconnect(id) { const client = this.map.get(id); if (client) { try { await client.disconnect(); } finally { this.map.delete(id); this.pcm.delete(id); this.lastVoiceError.delete(id); } } }
  writeAudio(data, id) {
    const client = this.map.get(id);
    if (!client || !Buffer.isBuffer(data)) return;
    let buffer = Buffer.concat([this.pcm.get(id) || Buffer.alloc(0), data]);
    while (buffer.length >= 3840) {
      const frame = buffer.subarray(0, 3840);
      buffer = buffer.subarray(3840);
      try { client.sendVoice(this.encoder.encode(frame, 960), 4); }
      catch (error) { this.diagnostic(id, error instanceof Error ? error.message : String(error)); }
    }
    this.pcm.set(id, buffer);
  }
  status() { return [...this.map.keys()]; }
}
