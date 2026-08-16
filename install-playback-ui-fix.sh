#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte mit sudo/root ausführen.' >&2; exit 1; }
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y curl python3
BASE="$(mktemp)"
trap 'rm -f "$BASE"' EXIT
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-music-playlist-fix.sh -o "$BASE"
chmod +x "$BASE"
bash "$BASE"

python3 - <<'PY'
from pathlib import Path

root = Path('/opt/radiobot')
backend = root / 'backend/src'

# Backend: remove the fixed FFmpeg volume filter so live volume can be controlled
# through discord.js' AudioResource inline volume support.
media = backend / 'media.ts'
s = media.read_text()
old = """export async function spawnPcm(input: string, volume: number) {
  const url = await resolveMedia(input);
  const ff = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', url, '-vn', '-af', `volume=${Math.max(0, Math.min(100, volume)) / 100}`, '-ar', '48000', '-ac', '2', '-f', 's16le', 'pipe:1']);
  return ff as ChildProcessWithoutNullStreams;
}
"""
new = """export async function spawnPcm(input: string, _volume: number) {
  const url = await resolveMedia(input);
  const ff = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', url, '-vn', '-ar', '48000', '-ac', '2', '-f', 's16le', 'pipe:1']);
  return ff as ChildProcessWithoutNullStreams;
}
"""
if old not in s:
    raise SystemExit('media spawnPcm patch target not found')
media.write_text(s.replace(old, new, 1))

# Backend: live volume, elapsed playback state, and real FFmpeg stderr diagnostics.
discord = backend / 'discord.ts'
s = discord.read_text()
s = s.replace("  volume = 80;\n", "  volume = 80;\n  audioResource?: any;\n", 1)
old_next = """  async next() {
    if (this.current) return;
    const item = this.queue.shift();
    if (!item) return;
    this.current = item;
    try {
      this.log('INFO', `Starte Wiedergabe: ${item.title}`);
      await this.ensureVoice();
      const ff = await spawnPcm(item.input, this.volume);
      this.ffmpeg = ff;
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const done = (error?: Error) => { if (settled) return; settled = true; error ? reject(error) : resolve(); };
        ff.once('error', error => done(error as Error));
        ff.once('close', code => code === 0 ? done() : done(new Error(`FFmpeg beendet (${code})`)));
        try { this.player.play(createAudioResource(ff.stdout, { inputType: StreamType.Raw })); }
        catch (error) { done(error instanceof Error ? error : new Error(String(error))); }
      });
      this.log('INFO', `Wiedergabe beendet: ${item.title}`);
    } catch (error) {
      this.recordError(`Wiedergabe fehlgeschlagen: ${errorText(error)}`);
    } finally {
      this.ffmpeg = undefined;
      this.current = undefined;
      if (this.queue.length) void this.next();
    }
  }
"""
new_next = """  async next() {
    if (this.current) return;
    const item = this.queue.shift();
    if (!item) return;
    this.current = { ...item, startedAt: Date.now() };
    try {
      this.log('INFO', `Starte Wiedergabe: ${item.title}`);
      await this.ensureVoice();
      const ff = await spawnPcm(item.input, this.volume);
      this.ffmpeg = ff;
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let stderr = '';
        ff.stderr.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 8000) stderr = stderr.slice(-8000); });
        const done = (error?: Error) => { if (settled) return; settled = true; error ? reject(error) : resolve(); };
        ff.once('error', error => done(error as Error));
        ff.once('close', code => {
          if (code === 0) return done();
          const detail = stderr.trim() || `Exit ${code}`;
          done(new Error(`FFmpeg beendet (${code}): ${detail}`));
        });
        try {
          const resource = createAudioResource(ff.stdout, { inputType: StreamType.Raw, inlineVolume: true });
          resource.volume?.setVolume(Math.max(0, Math.min(100, this.volume)) / 100);
          this.audioResource = resource;
          this.player.play(resource);
        } catch (error) { done(error instanceof Error ? error : new Error(String(error))); }
      });
      this.log('INFO', `Wiedergabe beendet: ${item.title}`);
    } catch (error) {
      this.recordError(`Wiedergabe fehlgeschlagen: ${errorText(error)}`);
    } finally {
      this.ffmpeg = undefined;
      this.audioResource = undefined;
      this.current = undefined;
      if (this.queue.length) void this.next();
    }
  }
"""
if old_next not in s:
    raise SystemExit('discord next() patch target not found')
s = s.replace(old_next, new_next, 1)
needle = "  state() {\n"
method = """  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(100, Number(value) || 0));
    this.audioResource?.volume?.setVolume(this.volume / 100);
    return this.volume;
  }

"""
if method not in s:
    s = s.replace(needle, method + needle, 1)
old_state = "return { id:this.cfg.id, name:this.cfg.name, type:'discord', enabled:this.isEnabled(), connected:this.connected, playing:this.current?.title ?? null, queue:this.queue.map(x=>x.title), volume:this.volume, error:this.lastError||null, logs:[...this.logs], inviteUrl:this.inviteUrl||this.buildInviteUrl()||null, botUser:this.client.user?.tag??null, guilds, voiceChannels:this.listVoiceChannels() };"
new_state = "return { id:this.cfg.id, name:this.cfg.name, type:'discord', enabled:this.isEnabled(), connected:this.connected, playing:this.current?.title ?? null, playingSince:this.current?.startedAt ?? null, elapsedSec:this.current?.startedAt ? Math.max(0, Math.floor((Date.now() - this.current.startedAt) / 1000)) : 0, queue:this.queue.map(x=>x.title), volume:this.volume, error:this.lastError||null, logs:[...this.logs], inviteUrl:this.inviteUrl||this.buildInviteUrl()||null, botUser:this.client.user?.tag??null, guilds, voiceChannels:this.listVoiceChannels() };"
if old_state not in s:
    raise SystemExit('discord state patch target not found')
s = s.replace(old_state, new_state, 1)
discord.write_text(s)

# Backend route: use live volume setter when available.
index = backend / 'index.ts'
s = index.read_text()
old = "else if (action === 'volume') active.volume = Math.max(0, Math.min(100, Number((request.body ?? {}).value ?? 80)));"
new = "else if (action === 'volume') { const value = Math.max(0, Math.min(100, Number((request.body ?? {}).value ?? 80))); if (typeof active.setVolume === 'function') active.setVolume(value); else active.volume = value; }"
if old not in s:
    raise SystemExit('index volume route patch target not found')
index.write_text(s.replace(old, new, 1))

# Frontend: dashboard playback status and Spotify-like playlist dialog.
ui = root / 'frontend/playback-ui-fix.js'
ui.write_text(r'''(() => {
  const styleId = 'playback-ui-fix-style';
  const api = (url, options={}) => fetch(url, {credentials:'include', headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options}).then(async r => { const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; });
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let lastState = null;
  let timer = null;
  function injectStyle(){ if(document.getElementById(styleId)) return; const s=document.createElement('style'); s.id=styleId; s.textContent = `
    .rb-playback-extra{margin-top:14px;padding:12px 14px;border:1px solid rgba(255,255,255,.08);border-radius:12px;display:grid;gap:10px}
    .rb-playback-line{display:flex;justify-content:space-between;gap:12px;align-items:center}
    .rb-playback-time{font-variant-numeric:tabular-nums;opacity:.8}
    .rb-playback-volume{display:flex;align-items:center;gap:10px}.rb-playback-volume input{flex:1}
    .rb-playlist-modal{position:fixed;inset:0;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:24px;z-index:99999}
    .rb-playlist-dialog{width:min(760px,96vw);max-height:82vh;overflow:hidden;border-radius:18px;background:#161616;border:1px solid rgba(255,255,255,.12);box-shadow:0 24px 80px rgba(0,0,0,.45);display:flex;flex-direction:column}
    .rb-playlist-head{padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;gap:12px;align-items:center}
    .rb-playlist-list{overflow:auto;padding:8px 20px 18px}.rb-playlist-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.06)}
    .rb-playlist-actions{display:flex;gap:6px}.rb-playlist-empty{opacity:.65;padding:24px 0;text-align:center}
  `; document.head.appendChild(s); }
  function fmt(sec){sec=Math.max(0,Math.floor(Number(sec)||0));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;}
  async function refreshPlayback(){
    try{ lastState=await api('/api/state'); }catch{return;}
    if(!document.querySelector('.hero-tile')) return;
    const instances=lastState.instances||[]; let inst=instances.find(x=>x.id===lastState.activeInstance); if(!inst) inst=instances.find(x=>x.connected)||instances[0]; if(!inst) return;
    let extra=document.querySelector('.rb-playback-extra');
    if(!extra){ const controls=document.querySelector('.hero-tile .controls'); if(!controls)return; extra=document.createElement('div'); extra.className='rb-playback-extra'; controls.after(extra); }
    const since=Number(inst.playingSince||0); const elapsed=inst.playing ? Math.max(0,Math.floor((Date.now()-since)/1000)) : 0;
    extra.innerHTML=`<div class="rb-playback-line"><span>${esc(inst.playing||'Keine Wiedergabe')}</span><span class="rb-playback-time">${fmt(elapsed)}</span></div><div class="rb-playback-volume"><span>🔊</span><input id="rbVolume" type="range" min="0" max="100" value="${Number(inst.volume??80)}"><b id="rbVolumeValue">${Number(inst.volume??80)}%</b></div>`;
    const slider=extra.querySelector('#rbVolume'); const value=extra.querySelector('#rbVolumeValue');
    slider.oninput=()=>{value.textContent=`${slider.value}%`;};
    slider.onchange=async()=>{try{await api('/api/control',{method:'POST',body:JSON.stringify({action:'volume',value:Number(slider.value)})});}catch(e){window.notify?.(e.message,'error');}};
  }
  async function openPlaylist(id){
    const state=await api('/api/state'); const p=(state.playlists||[]).find(x=>x.id===id); if(!p)throw new Error('Playlist nicht gefunden.');
    const wrap=document.createElement('div'); wrap.className='rb-playlist-modal'; wrap.innerHTML=`<div class="rb-playlist-dialog"><div class="rb-playlist-head"><div><strong>${esc(p.name)}</strong><div style="opacity:.7">${p.items?.length||0} Titel</div></div><button type="button" class="rb-close">Schließen</button></div><div class="rb-playlist-list"></div></div>`;
    const list=wrap.querySelector('.rb-playlist-list');
    (p.items||[]).forEach((item,index)=>{const row=document.createElement('div');row.className='rb-playlist-row';row.innerHTML=`<span>${esc(item.title||item.input)}</span><div class="rb-playlist-actions"><button type="button" class="rb-play">▶</button><button type="button" class="rb-delete">Löschen</button></div>`; row.querySelector('.rb-play').onclick=async()=>{try{await api('/api/play',{method:'POST',body:JSON.stringify({input:item.input,playNow:true})});window.notify?.('Wiedergabe gestartet.','success');}catch(e){window.notify?.(e.message,'error');}}; row.querySelector('.rb-delete').onclick=async()=>{try{await api(`/api/playlist/${encodeURIComponent(id)}/item/${index}`,{method:'DELETE'});wrap.remove();await openPlaylist(id);}catch(e){window.notify?.(e.message,'error');}};list.appendChild(row);});
    if(!(p.items||[]).length)list.innerHTML='<div class="rb-playlist-empty">Playlist ist leer.</div>';
    wrap.querySelector('.rb-close').onclick=()=>wrap.remove(); wrap.onclick=e=>{if(e.target===wrap)wrap.remove();}; document.body.appendChild(wrap);
  }
  function enhancePlaylists(){document.querySelectorAll('.playlist-card').forEach(card=>{if(card.querySelector('.rb-open-playlist'))return;const play=card.querySelector('button[onclick*="playPlaylist"]');const m=play?.getAttribute('onclick')?.match(/playPlaylist\(['\"]([^'\"]+)['\"]\)/);if(!m)return;const b=document.createElement('button');b.type='button';b.className='rb-open-playlist';b.textContent='Öffnen';b.onclick=()=>openPlaylist(m[1]).catch(e=>window.notify?.(e.message,'error'));play.parentElement?.appendChild(b);});}
  injectStyle();
  new MutationObserver(()=>{enhancePlaylists();refreshPlayback();}).observe(document.body,{childList:true,subtree:true});
  enhancePlaylists(); refreshPlayback();
  clearInterval(timer); timer=setInterval(refreshPlayback,1000);
})();
''')

idx = root / 'frontend/index.html'
html = idx.read_text()
tag = '<script src="/playback-ui-fix.js"></script>'
if tag not in html:
    html = html.replace('</body>', tag + '</body>')
    idx.write_text(html)
PY

cd /opt/radiobot/backend
npm install --include=dev --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund
systemctl restart radiobot
sleep 2
systemctl is-active --quiet radiobot
printf '\033[1;32mPlayback-/Dashboard-/Playlist-UI-Fix installiert.\033[0m\n'
