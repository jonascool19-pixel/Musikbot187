export const autoplayModes=Object.freeze(['playlists','similar']);
export const autoplayQueueBounds=Object.freeze({min:3,max:20,default:10});
export const autoplayDiscoveryQueries=Object.freeze([
  'aktuelle Musik Hits verschiedene Künstler',
  'beliebte Musik Deutschland verschiedene Künstler',
  'neue Musik entdecken Mix verschiedene Künstler'
]);
export const listeningProfileLimit=200;
export const autoplayMaxDurationSeconds=10*60;
export const autoplayProfileStyleLimit=20;
const listeningProfileFavorites=40;
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
  const styles=inferTrackStyles(track);
  return title?(styles.length?`${styles.slice(0,2).join(' ')} ähnliche Songs verschiedene Künstler Mix`:`${title} ähnliche Songs verschiedene Künstler Mix -cover -lyrics -remix`):'';
}

const variantWords=new Set(['official','music','video','audio','lyrics','lyric','live','remix','remastered','remaster','edit','version','sped','slowed','reverb','nightcore','cover','karaoke','instrumental','visualizer','visualiser','hq','hd','mv']);
export function recommendationFamily(track){const clean=String(track?.title||'').normalize('NFKC').toLocaleLowerCase('de-DE').replace(/[\[(][^\])]*(?:official|video|audio|lyrics?|live|remix|remaster|edit|version|sped|slowed|reverb|nightcore|cover|karaoke|instrumental|visuali[sz]er)[^\])]*[\])]/gi,' ').replace(/[^\p{L}\p{N}]+/gu,' '),tokens=clean.split(/\s+/).filter(token=>(token.length>1||/^\d+$/.test(token))&&!variantWords.has(token));return [...new Set(tokens)].sort().join('|');}
export function sameRecommendationFamily(left,right){const a=recommendationFamily(left),b=recommendationFamily(right);if(!a||!b)return false;if(a===b)return true;const aa=new Set(a.split('|')),bb=new Set(b.split('|')),intersection=[...aa].filter(token=>bb.has(token)).length,union=new Set([...aa,...bb]).size;return intersection>=4&&intersection/union>=.8;}

export function inferTrackStyles(track){
  const text=String(track?.title||'');
  return styleMatchers.filter(([,pattern])=>pattern.test(text)).map(([label])=>label);
}

const normalizeStyleValue=value=>String(value||'').normalize('NFKC').replace(/[\u0000-\u001f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,40);
const comparable=value=>normalizeStyleValue(value).toLocaleLowerCase('de-DE');
const unknownLongFormPattern=/\b(?:musik\s*quiz|music\s*quiz|megamix|continuous\s+mix|full\s+(?:album|mix|set|concert)|dj\s+set|podcast|live\s*stream|livestream|\d+\s*(?:hours?|stunden?))\b/i;
export function normalizeAutoplayStyles(values){const result=[],seen=new Set();for(const value of Array.isArray(values)?values:[]){const style=normalizeStyleValue(value),key=comparable(style);if(style.length<2||seen.has(key))continue;seen.add(key);result.push(style);if(result.length>=autoplayProfileStyleLimit)break}return result;}
export function autoplayTrackAllowed(track,blockedStyles=[]){const duration=Number(track?.duration)||0;if(duration>autoplayMaxDurationSeconds)return false;if(duration<=0&&unknownLongFormPattern.test(String(track?.title||'')))return false;const text=comparable(`${track?.title||''} ${(track?.styles||[]).join(' ')} ${inferTrackStyles(track).join(' ')}`);return !normalizeAutoplayStyles(blockedStyles).some(style=>text.includes(comparable(style)));}

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
    this.profile.version=2;
    this.profile.preferredStyles=normalizeAutoplayStyles(this.profile.preferredStyles);
    this.profile.blockedStyles=normalizeAutoplayStyles(this.profile.blockedStyles);
    this.getPlaylists=getPlaylists;
    this.recommend=recommend;
    this.save=save;
    this.diagnostic=diagnostic;
    this.cursor=0;
    this.recommendationBuffer=[];
    this.recentKeys=[];
    this.recentFamilies=[];
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
    const recent=[...this.profile.tracks].sort((a,b)=>Number(b.lastPlayed||0)-Number(a.lastPlayed||0)).map(track=>({key:track.key,title:track.title,source:track.source,listens:track.listens,lastPlayed:track.lastPlayed,styles:[...(track.styles||[])]}));
    return {learnedTracks:tracks.length,maxTracks:listeningProfileLimit,maxDurationMinutes:autoplayMaxDurationSeconds/60,totalListens:tracks.reduce((sum,track)=>sum+Math.max(1,Number(track.listens)||1),0),preferredStyles:[...this.profile.preferredStyles],blockedStyles:[...this.profile.blockedStyles],styles,top,tracks:recent};
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
    if(!key||track?.source==='radio'||track?.autoplayMode==='similar'||!autoplayTrackAllowed(track,this.profile.blockedStyles))return this.profileSummary();
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
    if(this.profile.tracks.length>listeningProfileLimit){const favorites=[...this.profile.tracks].sort((a,b)=>Number(b.listens||0)-Number(a.listens||0)||Number(b.lastPlayed||0)-Number(a.lastPlayed||0)).slice(0,listeningProfileFavorites),favoriteKeys=new Set(favorites.map(value=>value.key)),recent=[...this.profile.tracks].filter(value=>!favoriteKeys.has(value.key)).sort((a,b)=>Number(b.lastPlayed||0)-Number(a.lastPlayed||0)).slice(0,listeningProfileLimit-favorites.length);this.profile.tracks=[...favorites,...recent].sort((a,b)=>Number(b.lastPlayed||0)-Number(a.lastPlayed||0));}
    await this.save();
    return this.profileSummary();
  }

  async removeProfileTrack(key){const value=String(key||''),index=this.profile.tracks.findIndex(track=>track.key===value);if(index<0)throw new Error('Der gelernte Titel wurde nicht gefunden.');this.profile.tracks.splice(index,1);this.recentKeys=this.recentKeys.filter(item=>item!==value);this.recommendationBuffer=this.recommendationBuffer.filter(item=>autoplayTrackKey(item)!==value);if(this.lastSeedKey===value){this.lastSeedKey='';this.lastSeedTitle='';}await this.save();return this.profileSummary();}

  async updateProfileStyles({preferredStyles=[],blockedStyles=[]}={}){
    const prior=this.pending,enabled=Boolean(this.settings.autoplayEnabled);
    const blocked=normalizeAutoplayStyles(blockedStyles),blockedKeys=new Set(blocked.map(comparable)),preferred=normalizeAutoplayStyles(preferredStyles).filter(style=>!blockedKeys.has(comparable(style)));
    this.settings.autoplayEnabled=false;
    this.generation++;this.cancelScheduled();
    this.profile.preferredStyles=preferred;this.profile.blockedStyles=blocked;
    this.profile.tracks=this.profile.tracks.filter(track=>autoplayTrackAllowed(track,blocked));
    this.recommendationBuffer=[];this.lastSeedKey='';this.lastSeedTitle='';
    for(let index=this.player.queue.length-1;index>=0;index--)if(this.player.queue[index]?.autoplayMode==='similar')this.player.remove(index);
    this.settings.autoplayEnabled=enabled;
    await this.save();
    if(prior)await prior;
    if(enabled)await this.fill();
    return this.profileSummary();
  }

  async blockProfileTrack(key){const value=String(key||''),track=this.profile.tracks.find(entry=>entry.key===value);if(!track)throw new Error('Der gelernte Titel wurde nicht gefunden.');const detected=normalizeAutoplayStyles(track.styles),title=String(track.title||'').trim(),artist=title.split(/\s+[–—-]\s+/)[0]?.trim(),fallback=normalizeStyleValue(artist&&artist.length>=2?artist:title);const added=detected.length?detected:fallback?[fallback]:[];if(!added.length)throw new Error('Für diesen Titel konnte kein Sperrbegriff ermittelt werden.');const profile=await this.updateProfileStyles({preferredStyles:this.profile.preferredStyles,blockedStyles:[...this.profile.blockedStyles,...added]});return {profile,added:added.filter(style=>profile.blockedStyles.some(value=>comparable(value)===comparable(style)))};}

  async resetProfile(){
    this.profile.tracks=[];
    this.recommendationBuffer=[];
    this.recentKeys=[];
    this.recentFamilies=[];
    this.mixCounter=0;
    await this.save();
    return this.profileSummary();
  }

  resetRuntime(){
    this.generation++;
    this.cursor=0;
    this.recommendationBuffer=[];
    this.recentKeys=[];
    this.recentFamilies=[];
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
    const enabled=Boolean(this.settings.autoplayEnabled);
    const config=normalizeAutoplayConfiguration(input,this.getPlaylists());
    this.settings.autoplayEnabled=false;
    this.settings.autoplayMode=config.mode;
    this.settings.autoplayPlaylistIds=config.playlistIds;
    this.settings.autoplayQueueTarget=config.queueTarget;
    this.resetRuntime();
    if(enabled)this.player.clear();
    this.settings.autoplayEnabled=enabled;
    await this.save();
    if(prior)await prior;
    if(enabled)await this.fill();
    return this.state();
  }

  async setEnabled(value){
    const enabled=Boolean(value);
    const prior=this.pending;
    this.settings.autoplayEnabled=false;
    this.resetRuntime();
    this.player.clear();
    this.settings.autoplayEnabled=enabled;
    if(!enabled){
      this.statusCode='off';
      this.detail='Automatische Wiedergabe ist ausgeschaltet.';
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
    if(generation!==this.generation||!this.settings.autoplayEnabled)return this.state();
    if(!items.length){this.schedule(30_000);return this.state()}
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
    if(current?.source==='radio'){
      this.statusCode='waiting';
      this.detail='Ein Radiosender läuft dauerhaft. Ähnliche Titel werden bei einzelnen Musikstücken ergänzt.';
      return [];
    }
    const currentKey=autoplayTrackKey(current),profileSeeds=[...this.profile.tracks].sort((a,b)=>Number(b.lastPlayed||0)-Number(a.lastPlayed||0)).filter(track=>autoplayTrackKey(track)!==currentKey&&autoplayTrackAllowed(track,this.profile.blockedStyles)),librarySeeds=this.getPlaylists().flatMap(playlist=>playlist.items||[]).filter(track=>track&&track.source!=='radio'&&autoplayTrackAllowed(track,this.profile.blockedStyles));
    let useProfile=false,seed=current,discovery=false;
    if(!seed){if(profileSeeds.length){useProfile=true;seed=profileSeeds[this.mixCounter%profileSeeds.length]}else if(librarySeeds.length)seed=librarySeeds[this.mixCounter%librarySeeds.length];else{discovery=true;seed={id:'musikbot187-discovery',title:'Startmix',source:'youtube'};}}
    else if(profileSeeds.length>0&&this.mixCounter%3===2){useProfile=true;seed=profileSeeds[this.mixCounter%profileSeeds.length]}
    this.mixCounter++;
    const seedKey=autoplayTrackKey(seed);
    if(seedKey!==this.lastSeedKey){
      this.lastSeedKey=seedKey;
      this.lastSeedTitle=String(seed.title||'Aktueller Titel');
      this.recommendationBuffer=[];
    }
    const used=new Set([currentKey,seedKey,...this.profile.tracks.map(autoplayTrackKey),...this.player.queue.map(autoplayTrackKey),...this.recentKeys,...this.recommendationBuffer.map(autoplayTrackKey)].filter(Boolean)),familyReferences=[current,...(discovery?[]:[seed]),...this.profile.tracks,...this.player.queue,...this.recentFamilies].filter(Boolean);
    if(this.recommendationBuffer.length<needed){
      const blockedSuffix=this.profile.blockedStyles.map(style=>`-${/\s/.test(style)?`"${style.replaceAll('"','')}"`:style}`).join(' '),preferredQueries=this.profile.preferredStyles.map(style=>`${style} ähnliche Songs verschiedene Künstler`),primaryQuery=[this.profile.preferredStyles[this.mixCounter%Math.max(1,this.profile.preferredStyles.length)]||'',recommendationQuery(seed),blockedSuffix].filter(Boolean).join(' '),queries=[...new Set([primaryQuery,...preferredQueries.map(query=>`${query} ${blockedSuffix}`.trim()),...autoplayDiscoveryQueries.map(query=>`${query} ${blockedSuffix}`.trim())].filter(Boolean))];
      if(!queries.length){
        this.statusCode='waiting';
        this.detail='Der aktuelle Titel enthält zu wenig Angaben für ähnliche Vorschläge.';
        return [];
      }
      const failures=[],candidateKeys=new Set(used);
      for(const query of queries){
        let found=[];
        try{found=await this.recommend(seed,{query,limit:50})}catch(error){failures.push(String(error?.message||error));continue}
        const fresh=[];
        for(const track of Array.isArray(found)?found:[]){
          const key=autoplayTrackKey(track);
          if(!key||candidateKeys.has(key)||!autoplayTrackAllowed(track,this.profile.blockedStyles)||familyReferences.some(item=>sameRecommendationFamily(item,track))||fresh.some(item=>sameRecommendationFamily(item,track)))continue;
          fresh.push(track);candidateKeys.add(key);
        }
        this.recommendationBuffer.push(...fresh);
        if(this.recommendationBuffer.length>=needed)break;
      }
      if(!this.recommendationBuffer.length&&failures.length===queries.length)throw new Error(`YouTube-Suche für den Startmix fehlgeschlagen: ${failures.at(-1)}`);
    }
    const items=[];
    while(items.length<needed&&this.recommendationBuffer.length){
      const track=this.recommendationBuffer.shift(),key=autoplayTrackKey(track);
      if(!key||used.has(key))continue;
      used.add(key);
      this.recentKeys.push(key);
      if(this.recentKeys.length>250)this.recentKeys.splice(0,this.recentKeys.length-250);
      this.recentFamilies.push({title:track.title});
      if(this.recentFamilies.length>250)this.recentFamilies.splice(0,this.recentFamilies.length-250);
      items.push({...track,autoplay:true,autoplayMode:'similar',autoplaySeed:this.lastSeedTitle,autoplayFromProfile:useProfile});
    }
    if(!items.length){
      this.statusCode='waiting';
      this.detail=`Zu „${this.lastSeedTitle}“ wurden gerade keine weiteren eindeutigen Vorschläge gefunden. In 30 Sekunden wird automatisch erneut gesucht.`;
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
