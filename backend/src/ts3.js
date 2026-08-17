import { Client, generateIdentity } from "@honeybbq/teamspeak-client";
import OpusScript from "opusscript";

function address(host, port) {
  const h = String(host || "").trim(); const p = Number(port || 9987);
  if (/^\[[^\]]+\]:\d+$/.test(h) || /^[^:]+:\d+$/.test(h)) return h;
  if (h.includes(":") && !h.startsWith("[")) return `[${h}]:${p}`;
  return `${h}:${p}`;
}
function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
}
function validateConfig(config) {
  const host = String(config.host || "").trim();
  const port = Number(config.port || 9987);
  const nickname = String(config.nickname || "MusikBot187").trim();
  const channel = String(config.channel || "").trim();
  const password = String(config.password || "");
  if (!host || host.length > 255) throw new Error("TS3-Host fehlt oder ist zu lang");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Ungültiger TS3-Port");
  if (nickname.length < 1 || nickname.length > 64) throw new Error("Ungültiger TS3-Nickname");
  if (channel.length > 255 || password.length > 256) throw new Error("TS3-Konfiguration ist zu groß");
  return { ...config, host, port, nickname, channel, password };
}
export class TS3Manager {
  constructor(onDiagnostic = () => {}) { this.map = new Map(); this.configs = new Map(); this.reconnectTimers = new Map(); this.pcm = new Map(); this.lastVoiceError = new Map(); this.onDiagnostic = onDiagnostic; this.encoder = new OpusScript(48000, 2, OpusScript.Application.AUDIO); }
  diagnostic(id, message) { const key = String(id || "unknown"); const now = Date.now(); const last = this.lastVoiceError.get(key) || 0; if (now - last >= 5000) { this.lastVoiceError.set(key, now); this.onDiagnostic(`TS3 ${key}: ${String(message).slice(0, 1000)}`); } }
  scheduleReconnect(id) {
    const key = String(id);
    if (!this.configs.has(key) || this.reconnectTimers.has(key)) return;
    this.diagnostic(key, "Verbindung verloren; Wiederverbindung in 5s.");
    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(key);
      const config = this.configs.get(key); if (!config) return;
      try { await this.connect(config); this.diagnostic(key, "TS3-Verbindung wiederhergestellt."); }
      catch (error) { this.diagnostic(key, `Wiederverbindung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`); this.scheduleReconnect(key); }
    }, 5000);
    timer.unref?.(); this.reconnectTimers.set(key, timer);
  }
  async connect(config) {
    const checked = validateConfig(config); const key = String(checked.id);
    this.configs.set(key, { ...checked });
    await this.disconnect(key, false);
    if (!checked.enabled) throw new Error("Instanz ist ausgeschaltet");
    const client = new Client(generateIdentity(8), address(checked.host, checked.port), checked.nickname, { serverPassword: checked.password || undefined, defaultChannel: checked.channel || undefined });
    try {
      await withTimeout(client.connect(), 15000, "TS3-Verbindung hat das Zeitlimit überschritten");
      await withTimeout(client.waitConnected(AbortSignal.timeout(15000)), 15000, "TS3-Server wurde nicht rechtzeitig verbunden");
      this.map.set(key, client); this.pcm.set(key, Buffer.alloc(0)); this.lastVoiceError.delete(key);
    } catch (error) { try { await client.disconnect(); } catch {}; throw error; }
  }
  async disconnect(id, keepConfig = false) {
    const key = String(id); const timer = this.reconnectTimers.get(key);
    if (timer) { clearTimeout(timer); this.reconnectTimers.delete(key); }
    const client = this.map.get(key);
    try { if (client) await client.disconnect(); } finally { this.map.delete(key); this.pcm.delete(key); this.lastVoiceError.delete(key); if (!keepConfig) this.configs.delete(key); }
  }
  writeAudio(data, id) {
    const key = String(id); const client = this.map.get(key); if (!client || !Buffer.isBuffer(data)) return;
    let buffer = Buffer.concat([this.pcm.get(key) || Buffer.alloc(0), data]);
    while (buffer.length >= 3840) {
      const frame = buffer.subarray(0, 3840); buffer = buffer.subarray(3840);
      try { client.sendVoice(this.encoder.encode(frame, 960), 4); }
      catch (error) { this.diagnostic(key, error instanceof Error ? error.message : String(error)); void client.disconnect().catch(() => {}); this.map.delete(key); this.pcm.delete(key); this.scheduleReconnect(key); break; }
    }
    this.pcm.set(key, buffer.length > 3840 ? buffer.subarray(-3840) : buffer);
  }
  status() { return [...this.map.keys()]; }
}
