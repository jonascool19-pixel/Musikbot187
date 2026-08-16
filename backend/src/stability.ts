import { createAudioResource, StreamType, AudioPlayerStatus } from '@discordjs/voice';
import { spawnPcm } from './media.js';

function errorText(error: unknown) { return error instanceof Error ? error.message : String(error); }

export function applyDiscordStability(instance: any) {
  if (instance.__stabilityApplied) return instance;
  instance.__stabilityApplied = true;
  const originalEnsureVoice = instance.ensureVoice.bind(instance);
  instance.ensureVoice = async () => {
    if (instance.connection && instance.connection.state?.status === 'ready') {
      instance.connection.subscribe(instance.player);
      return;
    }
    return originalEnsureVoice();
  };
  instance.setVolume = (value: number) => {
    instance.volume = Math.max(0, Math.min(100, Number(value) || 0));
    instance.currentResource?.volume?.setVolume(instance.volume / 100);
  };
  instance.next = async () => {
    if (instance.current) return;
    const item = instance.queue.shift();
    if (!item) return;
    instance.current = item;
    try {
      instance.log?.('INFO', `Starte Wiedergabe: ${item.title}`);
      await instance.ensureVoice();
      const ff = await spawnPcm(item.input, 100);
      instance.ffmpeg = ff;
      const resource = createAudioResource(ff.stdout, { inputType: StreamType.Raw, inlineVolume: true });
      resource.volume?.setVolume(instance.volume / 100);
      instance.currentResource = resource;
      const finished = new Promise<void>((resolve, reject) => {
        let settled = false;
        const done = (error?: Error) => {
          if (settled) return;
          settled = true;
          error ? reject(error) : resolve();
        };
        ff.once('error', error => done(error as Error));
        ff.once('close', code => code === 0 ? done() : done(new Error(`FFmpeg beendet (${code})`)));
        instance.player.once(AudioPlayerStatus.Idle, () => done());
      });
      instance.player.play(resource);
      await finished;
      instance.log?.('INFO', `Wiedergabe beendet: ${item.title}`);
    } catch (error) {
      instance.recordError?.(`Wiedergabe fehlgeschlagen: ${errorText(error)}`);
    } finally {
      instance.ffmpeg = undefined;
      instance.currentResource = undefined;
      instance.current = undefined;
      if (instance.queue.length) void instance.next();
    }
  };
  return instance;
}

export function preferredInstance(discord: Map<string, any>, ts3: Map<string, any>, activeId = '') {
  const all = [...discord.values(), ...ts3.values()];
  const active = all.find(x => x.cfg?.id === activeId);
  if (active?.connected) return active;
  const playing = all.find(x => x.current && x.connected);
  if (playing) return playing;
  const connected = all.find(x => x.connected);
  if (connected) return connected;
  if (active) return active;
  return all[0];
}
