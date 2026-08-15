import { Client, generateIdentity, identityFromString } from '@honeybbq/teamspeak-client';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mediaTitle, opusPacketsFromOgg, FFMPEG, resolveMedia } from './media.js';

function esc(value: string) { return value.replaceAll('\\', '\\\\').replaceAll('|', '\\p').replaceAll(' ', '\\s').replaceAll('\n', '\\n').replaceAll('\r', '\\r'); }

export class Ts3Instance {
  cfg: any;
  client: any;
  queue: any[] = [];
  connected = false;
  current?: any;
  proc?: ChildProcessWithoutNullStreams;
  volume = 80;

  constructor(cfg: any) { this.cfg = cfg; }

  async start() {
    if (!this.cfg.host) return;
    try {
      const mod: any = await import('@honeybbq/teamspeak-client');
      const identity: any = this.cfg.identity ? identityFromString(this.cfg.identity) : generateIdentity(8);
      this.client = new Client(identity, this.cfg.host, this.cfg.nickname || 'RadioBot TS3', { serverPassword: this.cfg.serverPassword || undefined, defaultChannel: this.cfg.channel || undefined, defaultChannelPassword: this.cfg.channelPassword || undefined });
      this.client.on('connected', () => { this.connected = true; console.log(`TS3 ${this.cfg.name} online`); });
      this.client.on('disconnected', () => { this.connected = false; });
      this.client.on('textMessage', (message: any) => void this.onMessage(message));
      await this.client.connect();
      await this.client.waitConnected();
      const exported = identity?.exportString?.();
      if (!this.cfg.identity && exported) this.cfg.identity = exported;
    } catch (error) { console.error(`TS3 ${this.cfg.name}`, error); this.connected = false; }
  }

  async stop() { this.proc?.kill('SIGTERM'); try { await this.client?.disconnect?.(); } catch {} this.connected = false; }

  async add(input: string, playNow = false) {
    if (!input?.trim()) throw new Error('Keine Quelle angegeben.');
    const title = await mediaTitle(input);
    const item = { input, title };
    if (playNow) { this.proc?.kill('SIGTERM'); this.queue.unshift(item); }
    else this.queue.push(item);
    if (!this.current) await this.next();
    return item;
  }

  private async next() {
    if (this.current) return;
    const item = this.queue.shift();
    if (!item || !this.client) return;
    this.current = item;
    try {
      const url = await resolveMedia(item.input);
      const ff = spawn(FFMPEG, ['-hide_banner','-loglevel','error','-reconnect','1','-reconnect_streamed','1','-reconnect_delay_max','5','-i',url,'-vn','-af',`volume=${Math.max(0,Math.min(100,this.volume))/100}`,'-c:a','libopus','-application','audio','-frame_duration','20','-b:a','128k','-f','ogg','pipe:1']);
      this.proc = ff;
      const parser = opusPacketsFromOgg();
      for await (const chunk of ff.stdout) {
        for (const packet of parser.push(chunk as Buffer)) this.client.sendVoice(packet, 5);
      }
      await new Promise<void>(resolve => ff.once('close', () => resolve()));
    } catch (error) { console.error(`TS3 playback ${this.cfg.name}`, error); }
    finally { this.proc = undefined; this.current = undefined; if (this.queue.length) void this.next(); }
  }

  state() { return { id: this.cfg.id, name: this.cfg.name, type: 'ts3', connected: this.connected, playing: this.current?.title ?? null, queue: this.queue.map(x => x.title), volume: this.volume }; }

  private async onMessage(message: any) {
    const content = String(message?.message ?? '').trim();
    if (!content.startsWith('!')) return;
    const [cmd, ...rest] = content.slice(1).split(/\s+/);
    const arg = rest.join(' ');
    const reply = async (text: string) => this.client.execCommand(`sendtextmessage targetmode=2 target=${Number(message.targetID)} msg=${esc(text)}`);
    try {
      switch (cmd?.toLowerCase()) {
        case 'play': await this.add(arg); await reply('▶️ Zur Queue hinzugefügt.'); break;
        case 'radio': await this.add(arg); await reply('📻 Radio zur Queue hinzugefügt.'); break;
        case 'queue': await reply(this.queue.length ? this.queue.map((x, i) => `${i + 1}. ${x.title}`).join('\n') : 'Queue ist leer.'); break;
        case 'skip': this.proc?.kill('SIGTERM'); await reply('⏭️ Übersprungen.'); break;
        case 'stop': this.queue = []; this.proc?.kill('SIGTERM'); await reply('⏹️ Gestoppt.'); break;
        case 'pause': if (this.proc) this.proc.kill('SIGSTOP'); await reply('⏸️ Pausiert.'); break;
        case 'resume': if (this.proc) this.proc.kill('SIGCONT'); await reply('▶️ Fortgesetzt.'); break;
        case 'volume': this.volume = Math.max(0, Math.min(100, Number(rest[0] ?? 80))); await reply(`🔊 ${this.volume}%`); break;
      }
    } catch (error) { await reply(`Fehler: ${error instanceof Error ? error.message : String(error)}`).catch(() => undefined); }
  }
}
