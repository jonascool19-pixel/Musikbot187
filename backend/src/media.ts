import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export const YTDLP = process.env.YTDLP_PATH ?? '/usr/local/bin/yt-dlp';
export const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';

export function runCommand(args: string[], timeout = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Befehl Timeout')); }, timeout);
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => err += d.toString());
    child.on('error', reject);
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `Exit ${code}`)); });
  });
}

export async function resolveMedia(input: string) {
  if (/^https?:\/\//i.test(input)) return input;
  const out = await runCommand([YTDLP, '--no-playlist', '--no-warnings', '--get-url', '-f', 'bestaudio/best', `ytsearch1:${input}`]);
  return out.split(/\r?\n/)[0];
}

export async function mediaTitle(input: string) {
  if (!/^https?:\/\//i.test(input)) return input;
  try { return await runCommand([YTDLP, '--no-playlist', '--no-warnings', '--get-title', input], 15000); }
  catch { return input; }
}

export async function searchYouTube(q: string) {
  const raw = await runCommand([YTDLP, '--flat-playlist', '--dump-single-json', '--no-warnings', `ytsearch8:${q}`]);
  const data = JSON.parse(raw);
  return (data.entries ?? []).map((e: any) => ({ id: e.id, title: e.title, url: e.url || `https://www.youtube.com/watch?v=${e.id}`, duration: e.duration ?? null, channel: e.channel ?? e.uploader ?? '' }));
}

export async function searchRadio(q: string) {
  const url = `https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(q)}&limit=12&hidebroken=true&order=clickcount&reverse=true`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Radio-Suche ${r.status}`);
  const rows: any[] = await r.json();
  return rows.map(x => ({ id: x.stationuuid, name: x.name, url: x.url_resolved || x.url, codec: x.codec, bitrate: x.bitrate, country: x.country }));
}

export async function searchSpotify(instance: any, q: string) {
  if (!instance?.clientId || !instance?.clientSecret) throw new Error('Spotify-Zugangsdaten fehlen.');
  const basic = Buffer.from(`${instance.clientId}:${instance.clientSecret}`).toString('base64');
  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  if (!tokenResponse.ok) throw new Error(`Spotify Token ${tokenResponse.status}`);
  const token = (await tokenResponse.json() as any).access_token;
  const r = await fetch(`https://api.spotify.com/v1/search?type=track&limit=10&q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Spotify Suche ${r.status}`);
  const data: any = await r.json();
  return (data.tracks.items ?? []).map((t: any) => ({ id: t.id, title: t.name, artist: t.artists?.map((a: any) => a.name).join(', '), album: t.album?.name, url: t.external_urls?.spotify, search: `${t.name} ${t.artists?.[0]?.name ?? ''}` }));
}

export function opusPacketsFromOgg() {
  let buffer = Buffer.alloc(0);
  let packet = Buffer.alloc(0);
  let headersToSkip = 2;
  return {
    push(chunk: Buffer) {
      buffer = Buffer.concat([buffer, chunk]);
      const packets: Buffer[] = [];
      while (true) {
        const marker = Buffer.from('OggS');
        const idx = buffer.indexOf(marker);
        if (idx < 0) { if (buffer.length > 65536) buffer = buffer.subarray(buffer.length - 4); break; }
        if (idx > 0) buffer = buffer.subarray(idx);
        if (buffer.length < 27) break;
        const segments = buffer[26];
        if (buffer.length < 27 + segments) break;
        const lacing = buffer.subarray(27, 27 + segments);
        const size = lacing.reduce((a, b) => a + b, 0);
        const pageLength = 27 + segments + size;
        if (buffer.length < pageLength) break;
        const data = buffer.subarray(27 + segments, pageLength);
        let offset = 0;
        for (const len of lacing) {
          if (len) packet = Buffer.concat([packet, data.subarray(offset, offset + len)]);
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

export async function spawnPcm(input: string, volume: number) {
  const url = await resolveMedia(input);
  const ff = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', url, '-vn', '-af', `volume=${Math.max(0, Math.min(100, volume)) / 100}`, '-ar', '48000', '-ac', '2', '-f', 's16le', 'pipe:1']);
  return ff as ChildProcessWithoutNullStreams;
}
