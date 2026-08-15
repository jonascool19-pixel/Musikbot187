import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { Client, generateIdentity, identityFromString } from '@honeybbq/teamspeak-client';

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? '/var/lib/radiobot');
const MUSIC_DIR = path.join(DATA_DIR, 'music');
const IDENTITY_FILE = path.join(DATA_DIR, 'ts3-identity.txt');
const HOST = process.env.TEAMSPEAK_HOST ?? '';
const NICKNAME = process.env.TEAMSPEAK_NICKNAME ?? 'MusikBot187 TS3';
const CHANNEL = process.env.TEAMSPEAK_CHANNEL ?? '';
const CHANNEL_PASSWORD = process.env.TEAMSPEAK_CHANNEL_PASSWORD ?? '';
const SERVER_PASSWORD = process.env.TEAMSPEAK_SERVER_PASSWORD ?? '';
const YTDLP = process.env.YTDLP_PATH ?? '/usr/local/bin/yt-dlp';
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';

if (!HOST) throw new Error('TEAMSPEAK_HOST fehlt.');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(MUSIC_DIR, { recursive: true });

function escapeQuery(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('|', '\\p').replaceAll(' ', '\\s').replaceAll('\n', '\\n').replaceAll('\r', '\\r');
}
function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function resolveInput(input: string) {
  if (/^https?:\/\//i.test(input)) return input;
  return new Promise<string>((resolve, reject) => {
    const child = spawn(YTDLP, ['--no-playlist', '--no-warnings', '--get-url', '-f', 'bestaudio/best', `ytsearch1:${input}`]);
    let out = ''; let err = '';
    child.stdout.on('data', data => { out += data.toString(); });
    child.stderr.on('data', data => { err += data.toString(); });
    child.on('error', reject);
    child.on('close', code => code === 0 && out.trim() ? resolve(out.trim().split(/\r?\n/)[0]) : reject(new Error(err.trim() || `yt-dlp exit ${code}`)));
  });
}

async function resolveLabel(input: string) {
  if (/^https?:\/\//i.test(input)) {
    try {
      return await new Promise<string>((resolve, reject) => {
        const child = spawn(YTDLP, ['--no-playlist', '--no-warnings', '--get-title', input]);
        let out = ''; let err = '';
        child.stdout.on('data', data => { out += data.toString(); });
        child.stderr.on('data', data => { err += data.toString(); });
        child.on('error', reject);
        child.on('close', code => code === 0 && out.trim() ? resolve(out.trim()) : reject(new Error(err.trim() || `yt-dlp exit ${code}`)));
      });
    } catch { return input; }
  }
  return input;
}

function opusPacketsFromOgg() {
  let buffer = Buffer.alloc(0);
  let packet = Buffer.alloc(0);
  let headersToSkip = 2;
  return {
    push(chunk: Buffer): Buffer[] {
      buffer = Buffer.concat([buffer, chunk]);
      const packets: Buffer[] = [];
      while (true) {
        const idx = buffer.indexOf(Buffer.from('OggS'));
        if (idx < 0) { if (buffer.length > 65536) buffer = buffer.subarray(buffer.length - 4); break; }
        if (idx > 0) buffer = buffer.subarray(idx);
        if (buffer.length < 27) break;
        const segments = buffer[26];
        const pageLength = 27 + segments + [...buffer.subarray(27, 27 + segments)].reduce((a, b) => a + b, 0);
        if (buffer.length < pageLength) break;
        const lacing = buffer.subarray(27, 27 + segments);
        const data = buffer.subarray(27 + segments, pageLength);
        let offset = 0;
        for (const len of lacing) {
          if (len > 0) packet = Buffer.concat([packet, data.subarray(offset, offset + len)]);
          offset += len;
          if (len < 255) {
            if (headersToSkip > 0) headersToSkip--;
            else if (packet.length) packets.push(packet);
            packet = Buffer.alloc(0);
          }
        }
        buffer = buffer.subarray(pageLength);
      }
      return packets;
    }
  };
}

class Ts3MusicBot {
  private client!: Client;
  private queue: { input: string; label: string }[] = [];
  private current?: { input: string; label: string; ffmpeg?: ChildProcessWithoutNullStreams; paused?: boolean };
  private playing = false;
  private stopping = false;

  async start() {
    this.client = new Client(this.loadIdentity(), HOST, NICKNAME, {
      serverPassword: SERVER_PASSWORD,
      defaultChannel: CHANNEL || undefined,
      defaultChannelPassword: CHANNEL_PASSWORD || undefined,
    });
    this.client.on('connected', () => console.log(`TS3 verbunden: ${HOST} (${NICKNAME})`));
    this.client.on('disconnected', error => console.error('TS3 getrennt:', error?.message ?? 'clean'));
    this.client.on('kicked', reason => console.error('TS3 gekickt:', reason));
    this.client.on('textMessage', msg => { this.handleMessage(msg.message, msg.targetId).catch(error => console.error('TS3 command:', error)); });
    await this.client.connect();
    await this.client.waitConnected(AbortSignal.timeout(15000));
    console.log('TS3-Bot online. Befehle: !play <Suche/URL>, !queue, !skip, !pause, !resume, !stop, !radio <URL>');
    await this.playNext();
  }

  private loadIdentity() {
    try {
      const saved = fs.readFileSync(IDENTITY_FILE, 'utf8').trim();
      if (saved) return identityFromString(saved);
    } catch { /* generate below */ }
    const identity = generateIdentity(8);
    try { fs.writeFileSync(IDENTITY_FILE, identity.exportString(), { mode: 0o600 }); } catch (error) { console.error('TS3-Identität konnte nicht gespeichert werden:', error); }
    return identity;
  }

  private async reply(targetMode: number, targetId: number, text: string) {
    await this.client.execCommand(`sendtextmessage targetmode=${targetMode} target=${targetId} msg=${escapeQuery(text)}`);
  }

  private async handleMessage(message: string, targetId: number) {
    const trimmed = message.trim();
    if (!trimmed.startsWith('!')) return;
    const [command, ...rest] = trimmed.slice(1).split(/\s+/);
    const arg = rest.join(' ').trim();
    try {
      switch (command.toLowerCase()) {
        case 'play':
          if (!arg) return this.reply(2, targetId, 'Nutzung: !play <Titel, Suche oder URL>');
          await this.enqueue(arg, targetId); break;
        case 'radio':
          if (!arg || !/^https?:\/\//i.test(arg)) return this.reply(2, targetId, 'Nutzung: !radio <Stream-URL>');
          await this.enqueue(arg, targetId); break;
        case 'queue':
          await this.reply(2, targetId, this.queue.length ? `Queue:\n${this.queue.slice(0, 10).map((x, i) => `${i + 1}. ${x.label}`).join('\n')}` : 'Queue ist leer.'); break;
        case 'skip':
          this.current?.ffmpeg?.kill('SIGTERM'); await this.reply(2, targetId, 'Übersprungen.'); break;
        case 'pause':
          if (this.current?.ffmpeg && !this.current.paused) { this.current.paused = true; this.current.ffmpeg.kill('SIGSTOP'); await this.reply(2, targetId, 'Pausiert.'); } break;
        case 'resume':
          if (this.current?.ffmpeg && this.current.paused) { this.current.paused = false; this.current.ffmpeg.kill('SIGCONT'); await this.reply(2, targetId, 'Fortgesetzt.'); } break;
        case 'stop':
          this.stopping = true; this.queue = []; this.current?.ffmpeg?.kill('SIGTERM'); this.current = undefined; this.playing = false; await this.reply(2, targetId, 'Wiedergabe gestoppt.'); break;
        default: break;
      }
    } catch (error) {
      await this.reply(2, targetId, `Fehler: ${error instanceof Error ? error.message : String(error)}`).catch(() => undefined);
    }
  }

  private async enqueue(input: string, targetId: number) {
    const label = await resolveLabel(input);
    this.queue.push({ input, label });
    await this.reply(2, targetId, `Zur Queue hinzugefügt: ${label}`);
    if (!this.playing) await this.playNext();
  }

  private async playNext() {
    if (this.stopping || this.playing) return;
    const item = this.queue.shift();
    if (!item) return;
    this.stopping = false;
    this.playing = true;
    this.current = { ...item };
    try {
      const input = await resolveInput(item.input);
      const ffmpeg = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', input, '-vn', '-c:a', 'libopus', '-application', 'audio', '-frame_duration', '20', '-b:a', '128k', '-f', 'ogg', 'pipe:1'], { stdio: ['ignore', 'pipe', 'inherit'] });
      this.current.ffmpeg = ffmpeg;
      const parser = opusPacketsFromOgg();
      for await (const chunk of ffmpeg.stdout) {
        if (this.stopping) break;
        for (const opus of parser.push(chunk as Buffer)) {
          if (this.stopping) break;
          this.client.sendVoice(opus, 5);
          await sleep(20);
        }
      }
      await new Promise<void>(resolve => ffmpeg.once('close', () => resolve()));
    } catch (error) {
      console.error('TS3 playback failed:', item.label, error);
    } finally {
      this.current?.ffmpeg?.kill('SIGTERM');
      this.current = undefined;
      this.playing = false;
      if (!this.stopping) await this.playNext();
    }
  }
}

const bot = new Ts3MusicBot();
bot.start().catch(error => { console.error(error); process.exit(1); });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    try { await (bot as any).client?.disconnect?.(); } finally { process.exit(0); }
  });
}