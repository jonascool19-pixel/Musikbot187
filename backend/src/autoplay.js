export const autoplayModes=Object.freeze(['playlists','similar']);
export const autoplayQueueBounds=Object.freeze({min:3,max:20,default:5});
const listeningThresholdMs=30_000;
const styleMatchers=Object.freeze([
  ['Uptempo',/\buptempo\b/i],['Hardcore',/\b(?:hardcore|gabber)\b/i],['Hardstyle',/\b(?:hardstyle|rawstyle)\b/i],
  ['Techno',/\btechno\b/i],['House',/\bhouse\b/i],['Trance',/\btrance\b/i],['Drum & Bass',/\b(?:drum\s*(?:&|and|n)\s*bass|dnb)\b/i],
  ['Rap & Hip-Hop',/\b(?:rap|hip[ -]?hop|trap)\b/i],['Rock',/\brock\b/i],['Metal',/\bmetal\b/i],['Pop',/\bpop\b/i],['Schlager',/\bschlager\b/i]
]);

export function autoplayTrackKey(track){
  if(!track||typeof track!=='object')return '';
  const value=track.id||track.url||track.path||`${track.source||''}:${track.title||''}`;
  return String(value).trim().toLocaleLowerCase('de-DE');
}

export function recommendationQuery(track){
  const title=String(track?.title||'')
    .replace(/\.(?:mp3|wav|flac|ogg|opus|m4a|aac|webm)$/i,'')
    .replace(/[\[(](?:official\s*)?(?:music\s*)?(?:video|audio|lyrics?|visuali[sz]er)[\])]/gi,'')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,150);
  return title?`${title} ähnliche Songs Mix`:'';
}

export function inferTrackStyles(track){
  const text=String(track?.title||'');
  return styleMatchers.filter(([,pattern])=>pattern.test(text)).map(([label])=>label);
}

export function normalizeAutoplayConfiguration(input={},playlists=[]){
  const mode=autoplayModes.includes(input.mode)?input.mode:'playlists';
  const known=new Set(playlists.map(playlist=>playlist.id));
  const playlistIds=[];
  for(const value of Array.isArray(input.playlistIds)?input.playlistIds:[]){
    const id=String(value||'');
    if(known.has(id)&&!playlistIds.includes(id))playlistIds.push(id);
  }
  const requested=Number(input.queueTarget);
  const queueTarget=Number.isInteger(requested)
    ?Math.max(autoplayQueueBounds.min,Math.min(autoplayQueueBounds.max,requested))
    :autoplayQueueBounds.default;
  return {mode,playlistIds,queueTarget};
}

export class AutoplayController{
  constructor({player,settings,profile,getPlaylists,recommend,save=async()=>{},diagnostic=async()=>{}}){
    this.player=player;
    this.settings=settings;
    this.profile=profile&&typeof profile==='object'?profile:{version:1,tracks:[]};
    if(!Array.isArray(this.profile.tracks))this.profile.tracks=[];
    this.getPlaylists=getPlaylists;
    this.recommend=recommend;
    this.save=save;
    this.diagnostic=diagnostic;
    this.cursor=0;
    this.recommendationBuffer=[];
    this.recentKeys=[];
    this.lastSeedKey='';
    this.lastSeedTitle='';
    this.addedTotal=0;
    this.statusCode=this.settings.autoplayEnabled?'waiting':'off';
    this.detail=this.settings.autoplayEnabled?'Automatische Wiedergabe wird vorbereitet.':'Automatische Wiedergabe ist ausgeschaltet.';
    this.pending=null;
    this.scheduled=null;
    this.retryTimer=null;
    this.closed=false;
    this.lastDiagnostic='';
    this.generation=0;
    this.listenTimer=null;
    this.observedTrackKey='';
    this.mixCounter=0;
    this.onPlayerState=playerState=>{this.observe(playerState);this.schedule();};
    this.player.on('state',this.onPlayerState);
  }

  configuration(){
    return normalizeAutoplayConfiguration({
      mode:this.settings.autoplayMode,
      playlistIds:this.settings.autoplayPlaylistIds,
      queueTarget:this.settings.autoplayQueueTarget
    },this.getPlaylists());
  }

  state(){
    const config=this.configuration();
    return {
      enabled:Boolean(this.settings.autoplayEnabled),
      ...config,
      status:Boolean(this.settings.autoplayEnabled)?(this.pending?'filling':this.statusCode):'off',
      detail:Boolean(this.settings.autoplayEnabled)?this.detail:'Automatische Wiedergabe ist ausgeschaltet.',
      addedTotal:this.addedTotal,
      lastSeedTitle:this.lastSeedTitle||null,
      profile:this.profileSummary()
    };
  }

  profileSummary(){
    const tracks=[...this.profile.tracks],styleCounts=new Map();
    for(const track of tracks)for(const style of track.styles||[])styleCounts.set(style,(styleCounts.get(style)||0)+Math.max(1,Number(track.listens)||1));
    const top=tracks.sort((a,b)=>Number(b.listens||0)-Number(a.listens||0)||Number(b.lastPlayed||0)-Number(a.lastPlayed||0)).slice(0,8).map(track=>({title:track.title,source:track.source,listens:track.listens,lastPlayed:track.lastPlayed}));
    const styles=[...styleCounts].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,weight])=>({name,weight}));
    return {learnedTracks:tracks.length,totalListens:tracks.reduce((sum,track)=>sum+Math.max(1,Number(track.listens)||1),0),styles,top};
  }

  observe(playerState=this.player.state()){
    const track=playerState?.current,key=autoplayTrackKey(track);
    if(key===this.observedTrackKey)return;
    clearTimeout(this.listenTimer);
    this.listenTimer=null;
    this.observedTrackKey=key;
    if(!key||track.source==='radio')return;
    const expectedKey=key,check=()=>{
      const currentState=this.player.state(),currentKey=autoplayTrackKey(currentState.current);
      if(this.closed||currentKey!==expectedKey)return;
      if(currentState.paused||currentState.reconnecting||currentState.resolving||!currentState.playing){
        this.listenTimer=setTimeout(check,10_000);
        this.listenTimer.unref?.();
        return;
      }
      this.listenTimer=null;
      this.recordListened(currentState.current).catch(()=>{});
    };
    this.listenTimer=setTimeout(check,listeningThresholdMs);
    this.listenTimer.unref?.();
  }

  async recordListened(track,now=Date.now()){
    const key=autoplayTrackKey(track);
    if(!key||track?.source==='radio')return this.profileSummary();
    let entry=this.profile.tracks.find(value=>value.key===key);
    if(entry){
      entry.listens=Math.max(1,Number(entry.listens)||1)+1;
      entry.lastPlayed=now;
      entry.title=String(track.title||entry.title).slice(0,200);
      entry.styles=[...new Set([...(entry.styles||[]),...inferTrackStyles(track)])];
    }else{
      entry={key,title:String(track.title||'Ohne Titel').slice(0,200),source:String(track.source||''),id:String(track.id||''),url:String(track.url||''),path:String(track.path||''),duration:Number(track.duration)||0,styles:inferTrackStyles(track),listens:1,lastPlayed:now};
      this.profile.tracks.push(entry);
    }
    if(this.profile.tracks.length>120)this.profile.tracks.sort((a,b)=>Number(b.lastPlayed||0)-Number(a.lastPlayed||0)).splice(120);
    await this.save();
    return this.profileSummary();
  }

  async resetProfile(){
    this.profile.tracks=[];
    this.recommendationBuffer=[];
    this.recentKeys=[];
    this.mixCounter=0;
    await this.save();
    return this.profileSummary();
  }

  resetRuntime(){
    this.generation++;
    this.cursor=0;
    this.recommendationBuffer=[];
    this.recentKeys=[];
    this.lastSeedKey='';
    this.lastSeedTitle='';
    this.addedTotal=0;
    this.mixCounter=0;
    this.cancelScheduled();
    clearTimeout(this.retryTimer);
    this.retryTimer=null;
  }

  cancelScheduled(){
    if(!this.scheduled)return;
    if(this.scheduled.kind==='immediate')clearImmediate(this.scheduled.handle);
    else clearTimeout(this.scheduled.handle);
    this.scheduled=null;
  }

  schedule(delay=0){
    if(this.closed||!this.settings.autoplayEnabled||this.scheduled)return;
    const run=()=>{this.scheduled=null;this.fill().catch(()=>{});};
    const handle=delay>0?setTimeout(run,delay):setImmediate(run);
    handle.unref?.();
    this.scheduled={kind:delay>0?'timeout':'immediate',handle};
  }

  async configure(input){
    const prior=this.pending;
    const config=normalizeAutoplayConfiguration(input,this.getPlaylists());
    this.settings.autoplayMode=config.mode;
    this.settings.autoplayPlaylistIds=config.playlistIds;
    this.settings.autoplayQueueTarget=config.queueTarget;
    this.resetRuntime();
    if(this.settings.autoplayEnabled)this.player.clear();
    await this.save();
    if(prior)await prior;
    if(this.settings.autoplayEnabled)await this.fill();
    return this.state();
  }

  async setEnabled(value){
    const enabled=Boolean(value);
    const prior=this.pending;
    this.settings.autoplayEnabled=enabled;
    this.resetRuntime();
    if(!enabled){
      this.statusCode='off';
      this.detail='Automatische Wiedergabe ist ausgeschaltet.';
      this.player.clear();
    }else{
      this.statusCode='waiting';
      this.detail='Automatische Wiedergabe wird gestartet.';
    }
    await this.save();
    if(prior)await prior;
    if(enabled)await this.fill();
    return this.state();
  }

  async fill(){
    if(this.closed||!this.settings.autoplayEnabled)return this.state();
    if(this.pending)return this.pending;
    this.pending=this.fillNow().catch(async error=>{
      this.statusCode='error';
      this.detail=`Automatische Wiedergabe konnte die Warteschlange nicht füllen: ${error.message}`;
      if(this.lastDiagnostic!==error.message){
        this.lastDiagnostic=error.message;
        await Promise.resolve(this.diagnostic('error','autoplay',this.detail)).catch(()=>{});
      }
      clearTimeout(this.retryTimer);
      this.retryTimer=setTimeout(()=>{this.retryTimer=null;this.schedule();},30_000);
      this.retryTimer.unref?.();
      return this.state();
    }).finally(()=>{this.pending=null;});
    return this.pending;
  }

  async fillNow(){
    const generation=this.generation;
    const config=this.configuration();
    const needed=config.queueTarget-this.player.queue.length+(!this.player.current&&this.player.queue.length===0?1:0);
    if(needed<=0){
      this.statusCode='active';
      this.detail=`Warteschlange ist mit mindestens ${config.queueTarget} Titeln vorbereitet.`;
      return this.state();
    }
    const items=config.mode==='playlists'
      ?this.playlistItems(config,needed)
      :await this.similarItems(config,needed);
    if(generation!==this.generation||!this.settings.autoplayEnabled||!items.length)return this.state();
    this.player.add(items);
    this.addedTotal+=items.length;
    this.statusCode='active';
    this.detail=config.mode==='playlists'
      ?'Ausgewählte Playlists laufen der Reihe nach in Endlosschleife.'
      :`Ähnliche Titel zu „${this.lastSeedTitle}“ werden automatisch ergänzt.`;
    return this.state();
  }

  playlistItems(config,needed){
    const byId=new Map(this.getPlaylists().map(playlist=>[playlist.id,playlist]));
    const sequence=[];
    for(const playlistId of config.playlistIds){
      const playlist=byId.get(playlistId);
      for(const track of playlist?.items||[])if(track&&typeof track==='object')sequence.push({track,playlist});
    }
    if(!sequence.length){
      this.statusCode='waiting';
      this.detail=config.playlistIds.length?'Die ausgewählten Playlists enthalten noch keine Titel.':'Wähle auf der Autoplay-Seite mindestens eine Playlist aus.';
      return [];
    }
    const items=[];
    for(let index=0;index<needed;index++){
      const entry=sequence[this.cursor%sequence.length];
      this.cursor=(this.cursor+1)%sequence.length;
      items.push({...entry.track,autoplay:true,autoplayMode:'playlists',autoplayPlaylistId:entry.playlist.id,autoplayPlaylistName:entry.playlist.name});
    }
    return items;
  }

  async similarItems(config,needed){
    const current=this.player.current;
    if(!current){
      this.statusCode='waiting';
      this.detail='Starte zuerst einen Titel. Danach sucht Autoplay automatisch passende Musik.';
      return [];
    }
    if(current.source==='radio'){
      this.statusCode='waiting';
      this.detail='Ein Radiosender läuft dauerhaft. Ähnliche Titel werden bei einzelnen Musikstücken ergänzt.';
      return [];
    }
    const profileSeeds=[...this.profile.tracks].sort((a,b)=>Number(b.lastPlayed||0)-Number(a.lastPlayed||0)).filter(track=>autoplayTrackKey(track)!==autoplayTrackKey(current));
    const useProfile=profileSeeds.length>0&&this.mixCounter%3===2;
    const seed=useProfile?profileSeeds[this.mixCounter%profileSeeds.length]:current;
    this.mixCounter++;
    const seedKey=autoplayTrackKey(seed);
    if(seedKey!==this.lastSeedKey){
      this.lastSeedKey=seedKey;
      this.lastSeedTitle=String(seed.title||'Aktueller Titel');
      this.recommendationBuffer=[];
    }
    const used=new Set([autoplayTrackKey(current),seedKey,...this.player.queue.map(autoplayTrackKey),...this.recentKeys]);
    if(this.recommendationBuffer.length<needed){
      const query=recommendationQuery(seed);
      if(!query){
        this.statusCode='waiting';
        this.detail='Der aktuelle Titel enthält zu wenig Angaben für ähnliche Vorschläge.';
        return [];
      }
      const found=await this.recommend(seed,{query,limit:50});
      const fresh=[];
      for(const track of Array.isArray(found)?found:[]){
        const key=autoplayTrackKey(track);
        if(!key||used.has(key)||fresh.some(item=>autoplayTrackKey(item)===key))continue;
        fresh.push(track);
      }
      this.recommendationBuffer.push(...fresh);
    }
    const items=[];
    while(items.length<needed&&this.recommendationBuffer.length){
      const track=this.recommendationBuffer.shift(),key=autoplayTrackKey(track);
      if(!key||used.has(key))continue;
      used.add(key);
      this.recentKeys.push(key);
      if(this.recentKeys.length>250)this.recentKeys.splice(0,this.recentKeys.length-250);
      items.push({...track,autoplay:true,autoplayMode:'similar',autoplaySeed:this.lastSeedTitle,autoplayFromProfile:useProfile});
    }
    if(!items.length){
      this.statusCode='waiting';
      this.detail=`Zu „${this.lastSeedTitle}“ wurden gerade keine weiteren eindeutigen Vorschläge gefunden.`;
    }
    return items;
  }

  close(){
    this.closed=true;
    this.cancelScheduled();
    clearTimeout(this.retryTimer);
    this.retryTimer=null;
    clearTimeout(this.listenTimer);
    this.listenTimer=null;
    this.player.off('state',this.onPlayerState);
  }
}
