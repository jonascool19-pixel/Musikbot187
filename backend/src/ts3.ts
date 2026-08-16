import { Client, generateIdentity } from "@honeybbq/teamspeak-client";
import OpusScript from "opusscript";
import type { TS3Instance } from "./types.js";

export class TS3Manager {
  private clients = new Map<string, any>();
  private pcm = Buffer.alloc(0);
  private encoder = new OpusScript(48000, 2, OpusScript.Application.AUDIO);
  async connect(config: TS3Instance): Promise<void> {
    await this.disconnect(config.id);
    const client = new Client(generateIdentity(8), config.host, config.nickname, { serverPassword: config.password, defaultChannel: config.channel });
    await client.connect(); await client.waitConnected(AbortSignal.timeout(15000)); this.clients.set(config.id, client);
  }
  async disconnect(id: string): Promise<void> { const client = this.clients.get(id); if (client) { await client.disconnect(); this.clients.delete(id); } }
  writeAudio(data: Buffer, activeId: string): void {
    if (!this.clients.has(activeId)) return;
    this.pcm = Buffer.concat([this.pcm, data]);
    while (this.pcm.length >= 3840) {
      const frame = this.pcm.subarray(0, 3840); this.pcm = this.pcm.subarray(3840);
      const opus = this.encoder.encode(frame, 960); this.clients.get(activeId)?.sendVoice(opus, 4);
    }
  }
}
