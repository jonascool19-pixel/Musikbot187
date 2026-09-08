import {musicArtist} from './music-identity.js';
export const autoplayModes=Object.freeze(['playlists','similar']);
export const autoplayQueueBounds=Object.freeze({min:3,max:20,default:10});
export const autoplayDiscoveryQueries=Object.freeze([
  'aktuelle Musik Hits verschiedene Künstler',
  'beliebte Musik Deutschland verschiedene Künstler',
  'neue Musik entdecken Mix verschiedene Künstler'
]);
export const autoplaySearchVariants=Object.freeze(['neue Releases','Underground Tracks','Festival Tracks','aktuelle Songs','Label Releases']);
export const autoplayNonMusicSearchSuffix='-tutorial -anleitung -guide -review -reaction -interview -podcast -documentary -trailer -gameplay -playlist -compilation -"top 10" -"top 100"';
export const listeningProfileLimit=200;
export const autoplayMaxDurationSeconds=6*60;
export const autoplayProfileStyleLimit=20;
const listeningProfileFavorites=40;
const listeningThresholdMs=30_000;
const styleMatchers=Object.freeze([
  ['Uptempo',/\bup[\s-]?tempo\b/i],['Hardcore',/\b(?:hardcore|gabber)\b/i],['Hardstyle',/\b(?:hardstyle|rawstyle)\b/i],['Hardtekk',/\b(?:hardtekk?|hardtech|tekk)\b/i],
  ['Techno',/\btechno\b/i],['House',/\bhouse\b/i],['Trance',/\btrance\b/i],['Drum & Bass',/\b(?:drum\s*(?:&|and|n)\s*bass|dnb)\b/i],
  ['Rap & Hip-Hop',/\b(?:rap|hip[ -]?hop|trap)\b/i],['Rock',/\brock\b/i],['Metal',/\bmetal\b/i],['Pop',/\bpop\b/i],['Schlager',/\bschlager\b/i]
]);
const hardDanceStyles=new Set(['Uptempo','Hardcore','Hardstyle']);
const modernElectronicStyles=new Set(['Uptempo','Hardcore','Hardstyle','Hardtekk','Techno','House','Trance','Drum & Bass']);
const historicallyUnrelatedPattern=/\b(?:symphon(?:y|ie)|orchestra|orchester|philharmoni(?:c|e)|concerto|sonat[ae]|opera|operette?|musical|broadway|original\s+cast|show\s+tune|gershwin|mozart|beethoven|vivaldi|chopin|brahms|tchaikovsky|schubert|haydn)\b/i;
const oldYearPattern=/\b(?:18\d{2}|19[0-7]\d)\b/;
const definiteNonMusicPattern=/\b(?:how\s+to|so\s+(?:nutzt|nutzen|benutzt|benutzen|verwendet|verwenden)\s+(?:man|sie)|tutorials?|anleitung|einrichtung|setup|guide|erklärt|erklärung|explained|review|reaction|unboxing|interview|podcast|dokumentation|documentary|web\s+player|walkthrough|gameplay|let'?s\s+play|trailer|behind\s+the\s+scenes|making\s+of|nachrichten|news|top\s*\d+|best(?:e|en)?\s*\d+|best\s+of|greatest\s+hits|playlists?|compilations?|zusammenstellung|(?:songs?|lieder|hits)\s+(?:mix|sammlung))\b/i;
const likelyNonMusicPattern=/\b(?:study|studying|distracting|productivity|konzentrieren|lern(?:en|video)|tipps?|tips?|vergleich|comparison|episode|folge|vlog|shorts?)\b/i;
const musicMarkerPattern=/\b(?:official\s+(?:music\s+)?(?:video|audio)|lyrics?|lyric\s+video|visuali[sz]er|remix|radio\s+edit|extended\s+mix|music\s+video|official\s+song|feat\.?|ft\.?)\b/i;

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
  return title?(styles.length?`${styles.slice(0,2).join(' ')} ähnliche Songs verschiedene Künstler Mix`:`${title} ähnliche Songs verschiedene Künstler Mix -cover -lyrics`):'';
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
const comparableMusicTerm=value=>normalizeStyleValue(value).normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('de-DE').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const stylesIn=value=>styleMatchers.filter(([,pattern])=>pattern.test(String(value||''))).map(([label])=>label);
const compatibleStyle=(candidate,preferred)=>candidate===preferred||hardDanceStyles.has(candidate)&&hardDanceStyles.has(preferred);
const containsMusicTerm=(text,term)=>{const value=comparableMusicTerm(text),needle=comparableMusicTerm(term);return Boolean(needle&&` ${value} `.includes(` ${needle} `));};
export function listeningSignalWeight(track){
  const confirmed=track?.tasteConfirmed===true||Number(track?.listens)>0||track?.playlistIds?.length>0||Number(track?.rating)>0;
  if(!confirmed)return 0;
  return Math.max(0,(Number(track?.listens)||0)+(Number(track?.completed)||0)*2-(Number(track?.earlySkips)||0)*2+(Number(track?.rating)||0)*4);
}
const learnedPreferenceStyles=tracks=>{const counts=new Map();for(const track of Array.isArray(tracks)?tracks:[]){const weight=listeningSignalWeight(track);if(weight<=0)continue;for(const style of normalizeAutoplayStyles([...(track?.styles||[]),...inferTrackStyles(track)]))counts.set(style,(counts.get(style)||0)+weight)}return [...counts].sort((left,right)=>right[1]-left[1]).slice(0,6).map(([style])=>style);};
export function autoplayCandidateMatchesPreferences(track,{preferredStyles=[],preferredArtists=[],queryStyle='',queryArtist='',strictStyle=false}={}){
  const styles=normalizeAutoplayStyles(preferredStyles),artists=normalizeAutoplayStyles(preferredArtists);
  if(!styles.length&&!artists.length&&!queryStyle&&!queryArtist)return true;
  const text=`${track?.title||''} ${(track?.styles||[]).join(' ')}`,artist=musicArtist(track);
  const preferredKnown=[...new Set(styles.flatMap(stylesIn))],candidateKnown=[...new Set(stylesIn(text))];
  const explicitStyleMatch=styles.some(style=>containsMusicTerm(text,style))||candidateKnown.some(candidate=>preferredKnown.some(preferred=>strictStyle?candidate===preferred:compatibleStyle(candidate,preferred)));
  if(candidateKnown.length&&styles.length&&!explicitStyleMatch)return false;
  if(!explicitStyleMatch&&preferredKnown.some(style=>modernElectronicStyles.has(style))&&(historicallyUnrelatedPattern.test(text)||oldYearPattern.test(text)))return false;
  if(queryArtist)return containsMusicTerm(artist,queryArtist);
  if(queryStyle)return explicitStyleMatch;
  return explicitStyleMatch||artists.some(value=>containsMusicTerm(artist,value));
}
const unknownLongFormPattern=/\b(?:musik\s*quiz|music\s*quiz|megamix|continuous\s+mix|full\s+(?:album|mix|set|concert)|dj\s+set|podcast|live\s*stream|livestream|\d+\s*(?:hours?|stunden?))\b/i;
export function normalizeAutoplayStyles(values){const result=[],seen=new Set();for(const value of Array.isArray(values)?values:[]){const style=normalizeStyleValue(value),key=comparable(style);if(style.length<2||seen.has(key))continue;seen.add(key);result.push(style);if(result.length>=autoplayProfileStyleLimit)break}return result;}
export function autoplayTrackAllowed(track,blockedStyles=[]){const duration=Number(track?.duration)||0;if(duration>autoplayMaxDurationSeconds)return false;if(duration<=0&&unknownLongFormPattern.test(String(track?.title||'')))return false;const text=comparable(`${track?.title||''} ${musicArtist(track)} ${(track?.styles||[]).join(' ')} ${inferTrackStyles(track).join(' ')}`);return !normalizeAutoplayStyles(blockedStyles).some(style=>text.includes(comparable(style)));}
export function autoplayMusicCandidateAllowed(track,blockedStyles=[]){
  if(!autoplayTrackAllowed(track,blockedStyles))return false;
  if(track?.source&&track.source!=='youtube')return true;
  const title=String(track?.title||'').trim(),artist=String(track?.artist||track?.channel||track?.uploader||'').trim(),text=`${title} ${artist}`,duration=Number(track?.duration)||0,styleEvidence=stylesIn(`${text} ${(track?.styles||[]).join(' ')}`).length>0,strongMusicEvidence=styleEvidence||musicMarkerPattern.test(text)||/\btopic\b/i.test(artist);
  if(definiteNonMusicPattern.test(text))return false;
  if(likelyNonMusicPattern.test(text)&&!strongMusicEvidence)return false;
  if(duration>0&&duration<60&&!musicMarkerPattern.test(text)&&!styleEvidence)return false;
  return true;
}
export const normalizeAutoplayTermKind=value=>['genre','artist'].includes(String(value||''))?String(value):'any';
const autoplayArtistCandidate=item=>normalizeStyleValue(musicArtist(item));
const ignoredLearnedArtistPattern=/^(?:topic|various artists?|unknown|unbekannt|music|official)$/i;
const learnedArtistCandidate=item=>{
  const artist=autoplayArtistCandidate(item).replace(/\s*-\s*Topic$/i,'').trim();
  return artist&&!ignoredLearnedArtistPattern.test(artist)?artist:'';
};
const learnedPreferenceArtists=tracks=>{
  const counts=new Map();
  for(const track of Array.isArray(tracks)?tracks:[]){
    const artist=learnedArtistCandidate(track);
    if(!artist)continue;
    const weight=listeningSignalWeight(track);
    if(weight<=0)continue;
    counts.set(artist,(counts.get(artist)||0)+weight);
  }
  return [...counts].sort((left,right)=>right[1]-left[1]).slice(0,6).map(([artist])=>artist);
};
const profileTrackExcludedBySettings=(profile,track)=>{
  const key=autoplayTrackKey(track),excludedTracks=Array.isArray(profile?.excludedTracks)?profile.excludedTracks:[];
  if(key&&excludedTracks.some(item=>String(item?.key||'').toLocaleLowerCase('de-DE')===key))return true;
  const excludedPlaylists=new Set((Array.isArray(profile?.excludedPlaylistIds)?profile.excludedPlaylistIds:[]).map(value=>String(value||'')).filter(Boolean));
  const directPlaylistId=String(track?.playlistOriginId||track?.autoplayPlaylistId||'');
  if(directPlaylistId&&excludedPlaylists.has(directPlaylistId))return true;
  const learnedPlaylistIds=[...new Set((Array.isArray(track?.playlistIds)?track.playlistIds:[]).map(value=>String(value||'')).filter(Boolean))];
  return Boolean(learnedPlaylistIds.length&&learnedPlaylistIds.every(id=>excludedPlaylists.has(id)));
};
const autoplayPreferenceContext=profile=>{
  const manualStyles=normalizeAutoplayStyles(profile?.preferredStyles);
  const manualArtists=normalizeAutoplayStyles(profile?.preferredArtists);
  const activeTracks=(Array.isArray(profile?.tracks)?profile.tracks:[]).filter(track=>!profileTrackExcludedBySettings(profile,track));
  const learnedStyles=learnedPreferenceStyles(activeTracks);
  const learnedArtists=learnedPreferenceArtists(activeTracks);
  const styles=normalizeAutoplayStyles([...manualStyles,...learnedStyles]);
  const artists=normalizeAutoplayStyles([...manualArtists,...learnedArtists]);
  const hasManual=Boolean(manualStyles.length||manualArtists.length);
  const hasLearned=Boolean(learnedStyles.length||learnedArtists.length);
  return {
    styles,artists,manualStyles,manualArtists,learnedStyles,learnedArtists,hasManual,hasLearned,
    label:hasManual&&hasLearned?'deinen Musikvorgaben und deinem gelernten Profil':hasManual?'deinen Musikvorgaben':'deinem gelernten Musikprofil'
  };
};
export function autoplayTermSearchQuery(value,kind='any'){const term=normalizeStyleValue(value),type=normalizeAutoplayTermKind(kind);return term?type==='genre'?`${term} Musikrichtung Genre official audio`:type==='artist'?`${term} Künstler Songs official audio`:`${term} Musik Genre Künstler official audio`:'';}
export function validateAutoplayTermEvidence(value,results=[],kind='any'){
  const normalized=normalizeStyleValue(value),needle=comparableMusicTerm(normalized),type=normalizeAutoplayTermKind(kind);if(normalized.length<2||!needle)return {valid:false,normalized,type:type==='any'?'music-term':type,matched:normalized,evidence:[]};
  const known=styleMatchers.find(([label,pattern])=>comparableMusicTerm(label)===needle||pattern.test(normalized));
  if(type!=='artist'&&known)return {valid:true,normalized,type:'genre',matched:known[0],evidence:[`Bekannte Stilrichtung: ${known[0]}`]};
  const entries=(Array.isArray(results)?results:[]).filter(Boolean),titles=entries.map(item=>String(item?.title||'').trim()).filter(Boolean);
  if(type==='artist'){
    const artists=entries.map(item=>({name:autoplayArtistCandidate(item),title:String(item?.title||'').trim()})).filter(item=>item.name),match=artists.find(item=>comparableMusicTerm(item.name)===needle),evidence=artists.filter(item=>comparableMusicTerm(item.name)===needle).map(item=>item.title).filter(Boolean).slice(0,3);
    return {valid:Boolean(match),normalized,type:'artist',matched:match?.name||normalized,evidence};
  }
  const evidence=titles.filter(title=>` ${comparableMusicTerm(title)} `.includes(` ${needle} `)).slice(0,3);
  return {valid:Boolean(evidence.length),normalized,type:type==='genre'?'genre':'music-term',matched:normalized,evidence};
}
export function autoplayTermSuggestions(value,results=[],kind='any'){
  const normalized=normalizeStyleValue(value),needle=comparableMusicTerm(normalized),type=normalizeAutoplayTermKind(kind),suggestions=[],seen=new Set(),add=(candidate,candidateType,evidence='',force=false)=>{const clean=normalizeStyleValue(candidate),key=comparableMusicTerm(clean);if(clean.length<2||seen.has(key)||!force&&needle&&!key.includes(needle)&&!needle.includes(key))return;seen.add(key);suggestions.push({value:clean,type:candidateType,verified:true,evidence:String(evidence||'').slice(0,200)})};
  if(!needle)return suggestions;
  const exact=validateAutoplayTermEvidence(normalized,results,type);if(exact.valid)add(exact.matched||exact.normalized,exact.type,exact.evidence?.[0],true);
  if(type!=='artist')for(const [label] of styleMatchers)add(label,'genre',`Bekannte Stilrichtung: ${label}`);
  if(type!=='genre')for(const item of Array.isArray(results)?results:[])add(autoplayArtistCandidate(item),'artist',item?.title);
  return suggestions.slice(0,6);
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
    this.profile.version=2;
    this.profile.preferredStyles=normalizeAutoplayStyles(this.profile.preferredStyles);
    this.profile.preferredArtists=normalizeAutoplayStyles(this.profile.preferredArtists);
    this.profile.blockedStyles=normalizeAutoplayStyles(this.profile.blockedStyles);
    this.profile.excludedTracks=(Array.isArray(this.profile.excludedTracks)?this.profile.excludedTracks:[]).map(item=>typeof item==='string'?{key:item,title:''}:item).filter(item=>item&&autoplayTrackKey({id:item.key})).slice(-listeningProfileLimit).map(item=>({key:String(item.key).trim().toLocaleLowerCase('de-DE').slice(0,500),title:String(item.title||'').slice(0,200)}));
    this.profile.excludedPlaylistIds=[...new Set((Array.isArray(this.profile.excludedPlaylistIds)?this.profile.excludedPlaylistIds:[]).map(value=>String(value||'')).filter(Boolean))].slice(-100);
    this.getPlaylists=getPlaylists;
    this.recommend=recommend;
    this.save=save;
    this.diagnostic=diagnostic;
    this.cursor=0;
    this.recommendationBuffer=[];
    this.profile.recentAutoplay=(Array.isArray(this.profile.recentAutoplay)?this.profile.recentAutoplay:[]).filter(item=>item&&typeof item.key==='string'&&item.key).slice(-250).map(item=>({key:String(item.key).slice(0,500),title:String(item.title||'').slice(0,200)}));
    this.recentKeys=this.profile.recentAutoplay.map(item=>item.key);
    this.recentFamilies=this.profile.recentAutoplay.map(item=>({title:item.title}));
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
    this.onTrackEnd=event=>{this.recordPlaybackOutcome(event).catch(()=>{});};
    this.player.on('state',this.onPlayerState);
    this.player.on('track-end',this.onTrackEnd);
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
    const tracks=this.profile.tracks.filter(track=>!this.profileTrackExcluded(track)),styleCounts=new Map(),artistCounts=new Map();
    for(const track of tracks){
      const weight=listeningSignalWeight(track);
      if(weight<=0)continue;
      for(const style of track.styles||[])styleCounts.set(style,(styleCounts.get(style)||0)+weight);
      const artist=learnedArtistCandidate(track);
      if(artist)artistCounts.set(artist,(artistCounts.get(artist)||0)+weight);
    }
    const top=tracks.filter(track=>listeningSignalWeight(track)>0).sort((a,b)=>listeningSignalWeight(b)-listeningSignalWeight(a)||Number(b.lastPlayed||0)-Number(a.lastPlayed||0)).slice(0,8).map(track=>({title:track.title,artist:learnedArtistCandidate(track),source:track.source,listens:Number(track.listens)||0,completed:Number(track.completed)||0,earlySkips:Number(track.earlySkips)||0,rating:Number(track.rating)||0,weight:listeningSignalWeight(track),lastPlayed:track.lastPlayed}));
    const styles=[...styleCounts].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,weight])=>({name,weight}));
    const artists=[...artistCounts].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,weight])=>({name,weight}));
    const recent=[...tracks].sort((a,b)=>Number(b.lastPlayed||0)-Number(a.lastPlayed||0)).map(track=>({key:track.key,title:track.title,artist:learnedArtistCandidate(track),source:track.source,listens:Number(track.listens)||0,completed:Number(track.completed)||0,earlySkips:Number(track.earlySkips)||0,rating:Number(track.rating)||0,weight:listeningSignalWeight(track),lastPlayed:track.lastPlayed,styles:[...(track.styles||[])]}));
    return {learnedTracks:tracks.length,maxTracks:listeningProfileLimit,maxDurationMinutes:autoplayMaxDurationSeconds/60,totalListens:tracks.reduce((sum,track)=>sum+(Number(track.listens)||0),0),preferredStyles:[...this.profile.preferredStyles],preferredArtists:[...this.profile.preferredArtists],blockedStyles:[...this.profile.blockedStyles],excludedTracks:this.profile.excludedTracks.map(item=>({...item})),excludedPlaylistIds:[...this.profile.excludedPlaylistIds],styles,artists,top,tracks:recent};
  }

  profileTrackExcluded(track){return profileTrackExcludedBySettings(this.profile,track);}

  upsertProfileTrack(track,now=Date.now()){
    const key=autoplayTrackKey(track);if(!key)return null;
    let entry=this.profile.tracks.find(value=>value.key===key);
    const playlistId=String(track?.playlistOriginId||track?.autoplayPlaylistId||''),playlistIds=[...new Set([...(entry?.playlistIds||[]),...(playlistId?[playlistId]:[])])];
    if(entry){entry.title=String(track.title||entry.title||'Ohne Titel').slice(0,200);entry.artist=learnedArtistCandidate(track)||entry.artist||'';entry.source=String(track.source||entry.source||'');entry.id=String(track.id||entry.id||'');entry.url=String(track.url||entry.url||'');entry.path=String(track.path||entry.path||'');entry.duration=Number(track.duration)||Number(entry.duration)||0;entry.styles=[...new Set([...(entry.styles||[]),...inferTrackStyles(track)])];entry.playlistIds=playlistIds;entry.lastPlayed=now;return entry;}
    entry={key,title:String(track.title||'Ohne Titel').slice(0,200),artist:learnedArtistCandidate(track),source:String(track.source||''),id:String(track.id||''),url:String(track.url||''),path:String(track.path||''),duration:Number(track.duration)||0,styles:inferTrackStyles(track),playlistIds,listens:0,completed:0,earlySkips:0,rating:0,lastPlayed:now};this.profile.tracks.push(entry);return entry;
  }

  pruneProfile(){if(this.profile.tracks.length<=listeningProfileLimit)return;const favorites=[...this.profile.tracks].sort((a,b)=>listeningSignalWeight(b)-listeningSignalWeight(a)||Number(b.lastPlayed||0)-Number(a.lastPlayed||0)).slice(0,listeningProfileFavorites),favoriteKeys=new Set(favorites.map(value=>value.key)),recent=[...this.profile.tracks].filter(value=>!favoriteKeys.has(value.key)).sort((a,b)=>Number(b.lastPlayed||0)-Number(a.lastPlayed||0)).slice(0,listeningProfileLimit-favorites.length);this.profile.tracks=[...favorites,...recent].sort((a,b)=>Number(b.lastPlayed||0)-Number(a.lastPlayed||0));}

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
    if(!key||track?.source==='radio'||track?.autoplayMode==='similar'||this.profileTrackExcluded(track)||!autoplayTrackAllowed(track,this.profile.blockedStyles))return this.profileSummary();
    const entry=this.upsertProfileTrack(track,now);entry.tasteConfirmed=true;entry.listens=(Number(entry.listens)||0)+1;this.pruneProfile();
    await this.save();
    return this.profileSummary();
  }

  async recordPlaybackOutcome(event,now=Date.now()){
    const track=event?.track,reason=String(event?.reason||''),key=autoplayTrackKey(track);
    if(!key||track?.source==='radio'||this.profileTrackExcluded(track)||!autoplayTrackAllowed(track,this.profile.blockedStyles))return this.profileSummary();
    const duration=Math.max(0,Number(event?.duration)||Number(track.duration)||0),position=Math.max(0,Number(event?.positionSeconds)||0),earlyLimit=Math.min(45,duration>0?duration*.35:45);
    if(reason!=='completed'&&!(reason==='skipped'&&position<earlyLimit))return this.profileSummary();
    const entry=this.upsertProfileTrack(track,now);
    if(track?.autoplayMode!=='similar')entry.tasteConfirmed=true;
    if(reason==='completed')entry.completed=(Number(entry.completed)||0)+1;
    else entry.earlySkips=(Number(entry.earlySkips)||0)+1;
    this.pruneProfile();await this.save();return this.profileSummary();
  }

  async feedbackCurrent(action,track=this.player.current,now=Date.now()){
    if(!['more','less'].includes(action))throw new Error('Unbekannte Bewertung.');
    if(!track||track.source==='radio')throw new Error('Aktuell läuft kein bewertbarer Musiktitel.');
    if(this.profileTrackExcluded(track))throw new Error('Dieser Titel oder seine Playlist ist vom Musikprofil ausgeschlossen.');
    const entry=this.upsertProfileTrack(track,now);if(action==='more')entry.tasteConfirmed=true;entry.rating=Math.max(-3,Math.min(3,(Number(entry.rating)||0)+(action==='more'?1:-1)));this.pruneProfile();this.resetRecommendationSelection({preserveQueue:true});await this.save();if(this.settings.autoplayEnabled)this.schedule();return {profile:this.profileSummary(),action,rating:entry.rating};
  }

  async learnFromPlaylists(playlists,now=Date.now()){
    const selected=(Array.isArray(playlists)?playlists:[]).filter(playlist=>playlist&&Array.isArray(playlist.items));
    if(!selected.length)throw new Error('Bitte mindestens eine Playlist auswählen.');
    const rows=[],largest=Math.max(0,...selected.map(playlist=>playlist.items.length));
    for(let index=0;index<largest;index++)for(const playlist of selected)if(playlist.items[index])rows.push({track:playlist.items[index],playlistId:String(playlist.id||'')});
    const beforeKeys=new Set(this.profile.tracks.map(track=>track.key)),seen=new Set();let accepted=0,existing=0,ignored=0;
    for(let rowIndex=0;rowIndex<rows.length;rowIndex++){
      const {track,playlistId}=rows[rowIndex];
      const key=autoplayTrackKey(track);
      const tagged={...track,playlistOriginId:playlistId};
      if(!key||this.profile.excludedPlaylistIds.includes(playlistId)||this.profileTrackExcluded(tagged)||track?.source==='radio'||track?.autoplayMode==='similar'||!autoplayTrackAllowed(track,this.profile.blockedStyles)){ignored++;continue}
      if(seen.has(key)){const duplicate=this.profile.tracks.find(value=>value.key===key);if(duplicate)duplicate.playlistIds=[...new Set([...(duplicate.playlistIds||[]),playlistId].filter(Boolean))];ignored++;continue}
      seen.add(key);accepted++;
      const entry=this.profile.tracks.find(value=>value.key===key),created=!entry,updated=this.upsertProfileTrack(tagged,now-rowIndex);
      updated.tasteConfirmed=true;
      if(!created){existing++;continue}
      updated.listens=1;
    }
    this.pruneProfile();
    await this.save();
    const afterKeys=new Set(this.profile.tracks.map(track=>track.key)),added=[...afterKeys].filter(key=>!beforeKeys.has(key)).length;
    return {profile:this.profileSummary(),playlistCount:selected.length,scanned:rows.length,accepted,added,existing,ignored};
  }

  resetRecommendationSelection({preserveQueue=false}={}){this.recommendationBuffer=[];this.lastSeedKey='';this.lastSeedTitle='';if(preserveQueue)return;for(let index=this.player.queue.length-1;index>=0;index--)if(this.player.queue[index]?.autoplayMode==='similar')this.player.remove(index);}

  async removeProfileTrack(key){const value=String(key||'').trim().toLocaleLowerCase('de-DE'),index=this.profile.tracks.findIndex(track=>track.key===value);if(index<0)throw new Error('Der gelernte Titel wurde nicht gefunden.');const [track]=this.profile.tracks.splice(index,1);if(!this.profile.excludedTracks.some(item=>item.key===value))this.profile.excludedTracks.push({key:value,title:String(track.title||'').slice(0,200)});this.profile.excludedTracks=this.profile.excludedTracks.slice(-listeningProfileLimit);this.resetRecommendationSelection({preserveQueue:true});await this.save();if(this.settings.autoplayEnabled)this.schedule();return this.profileSummary();}

  async excludeCurrentTrack(track=this.player.current){const key=autoplayTrackKey(track);if(!key||track?.source==='radio')throw new Error('Aktuell läuft kein ausschließbarer Musiktitel.');const index=this.profile.tracks.findIndex(entry=>entry.key===key);if(index>=0)this.profile.tracks.splice(index,1);if(!this.profile.excludedTracks.some(item=>item.key===key))this.profile.excludedTracks.push({key,title:String(track.title||'Ohne Titel').slice(0,200)});this.profile.excludedTracks=this.profile.excludedTracks.slice(-listeningProfileLimit);this.resetRecommendationSelection({preserveQueue:true});await this.save();if(this.settings.autoplayEnabled)this.schedule();return this.profileSummary();}

  async restoreProfileTrack(key){const value=String(key||'').trim().toLocaleLowerCase('de-DE'),before=this.profile.excludedTracks.length;this.profile.excludedTracks=this.profile.excludedTracks.filter(item=>item.key!==value);if(before===this.profile.excludedTracks.length)throw new Error('Der ausgeschlossene Titel wurde nicht gefunden.');this.resetRecommendationSelection({preserveQueue:true});await this.save();if(this.settings.autoplayEnabled)this.schedule();return this.profileSummary();}

  async setPlaylistLearning(playlistId,enabled){const value=String(playlistId||'');if(!this.getPlaylists().some(playlist=>playlist.id===value))throw new Error('Playlist wurde nicht gefunden.');if(enabled)this.profile.excludedPlaylistIds=this.profile.excludedPlaylistIds.filter(id=>id!==value);else if(!this.profile.excludedPlaylistIds.includes(value))this.profile.excludedPlaylistIds.push(value);this.profile.excludedPlaylistIds=this.profile.excludedPlaylistIds.slice(-100);this.resetRecommendationSelection({preserveQueue:true});await this.save();if(this.settings.autoplayEnabled)this.schedule();return this.profileSummary();}

  async updateProfileStyles({preferredStyles=[],preferredArtists=[],blockedStyles=[]}={}){
    const prior=this.pending,enabled=Boolean(this.settings.autoplayEnabled);
    const blocked=normalizeAutoplayStyles(blockedStyles),blockedKeys=new Set(blocked.map(comparable)),preferred=normalizeAutoplayStyles(preferredStyles).filter(style=>!blockedKeys.has(comparable(style))),preferredStyleKeys=new Set(preferred.map(comparable)),artists=normalizeAutoplayStyles(preferredArtists).filter(artist=>!blockedKeys.has(comparable(artist))&&!preferredStyleKeys.has(comparable(artist)));
    this.settings.autoplayEnabled=false;
    this.generation++;this.cancelScheduled();
    this.profile.preferredStyles=preferred;this.profile.preferredArtists=artists;this.profile.blockedStyles=blocked;
    this.profile.tracks=this.profile.tracks.filter(track=>autoplayTrackAllowed(track,blocked));
    this.resetRecommendationSelection();
    this.settings.autoplayEnabled=enabled;
    await this.save();
    if(prior)prior.catch(()=>{}).finally(()=>{if(enabled)this.schedule()});
    else if(enabled)this.schedule();
    return this.profileSummary();
  }

  async blockProfileTrack(key){const value=String(key||''),track=this.profile.tracks.find(entry=>entry.key===value);if(!track)throw new Error('Der gelernte Titel wurde nicht gefunden.');const detected=normalizeAutoplayStyles(track.styles),title=String(track.title||'').trim(),artist=title.split(/\s+[–—-]\s+/)[0]?.trim(),fallback=normalizeStyleValue(artist&&artist.length>=2?artist:title);const added=detected.length?detected:fallback?[fallback]:[];if(!added.length)throw new Error('Für diesen Titel konnte kein Sperrbegriff ermittelt werden.');const profile=await this.updateProfileStyles({preferredStyles:this.profile.preferredStyles,preferredArtists:this.profile.preferredArtists,blockedStyles:[...this.profile.blockedStyles,...added]});return {profile,added:added.filter(style=>profile.blockedStyles.some(value=>comparable(value)===comparable(style)))};}

  async resetProfile(){
    this.profile.tracks=[];
    this.profile.recentAutoplay=[];
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
    if(config.mode==='similar')this.removeInvalidSimilarAutoplay();
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
    const preferences=autoplayPreferenceContext(this.profile),preferenceNames=[...preferences.styles,...preferences.artists];
    this.detail=config.mode==='playlists'
      ?'Ausgewählte Playlists laufen der Reihe nach in Endlosschleife.'
      :preferenceNames.length
        ?`Bekannte Favoriten und neue Titel passend zu ${preferences.label} (${preferenceNames.join(', ')}) werden gemischt. Ziel: 5 bekannte + 5 neue pro 10 Titel, soweit passende Titel verfügbar sind.`
        :`Ähnliche Titel zu „${this.lastSeedTitle}“ werden automatisch ergänzt.`;
    return this.state();
  }

  removeInvalidSimilarAutoplay(){
    const preferences=autoplayPreferenceContext(this.profile),valid=track=>{
      const known=this.profile.tracks.find(entry=>autoplayTrackKey(entry)===autoplayTrackKey(track)&&listeningSignalWeight(entry)>0);
      return !this.profileTrackExcluded(track)&&autoplayMusicCandidateAllowed(track,this.profile.blockedStyles)&&
        (track.autoplayKnownFavorite&&known||autoplayCandidateMatchesPreferences(track,{preferredStyles:preferences.styles,preferredArtists:preferences.artists,strictStyle:true}));
    };
    for(let index=this.player.queue.length-1;index>=0;index--){const track=this.player.queue[index];if(track?.autoplayMode==='similar'&&!valid(track))this.player.remove(index)}
    const current=this.player.current;if(current?.autoplayMode==='similar'&&!valid(current))this.player.skip('autoplay-filter');
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
    const generation=this.generation,current=this.player.current;
    if(current?.source==='radio'){
      this.statusCode='waiting';
      this.detail='Ein Radiosender läuft dauerhaft. Ähnliche Titel werden bei einzelnen Musikstücken ergänzt.';
      return [];
    }
    const preferences=autoplayPreferenceContext(this.profile),preferredStyles=preferences.styles,preferredArtists=preferences.artists,hasMusicPreferences=Boolean(preferredStyles.length||preferredArtists.length),currentKey=autoplayTrackKey(current),profileSeeds=[...this.profile.tracks].sort((a,b)=>listeningSignalWeight(b)-listeningSignalWeight(a)||Number(b.lastPlayed||0)-Number(a.lastPlayed||0)).filter(track=>listeningSignalWeight(track)>0&&autoplayTrackKey(track)!==currentKey&&!this.profileTrackExcluded(track)&&autoplayTrackAllowed(track,this.profile.blockedStyles)),librarySeeds=this.getPlaylists().filter(playlist=>!this.profile.excludedPlaylistIds.includes(String(playlist.id||''))).flatMap(playlist=>(playlist.items||[]).map(track=>({...track,playlistOriginId:playlist.id}))).filter(track=>track&&track.source!=='radio'&&!this.profileTrackExcluded(track)&&autoplayTrackAllowed(track,this.profile.blockedStyles)),mixIndex=this.mixCounter;
    let useProfile=false,seed=current,discovery=false;
    if(!seed){if(profileSeeds.length){useProfile=true;seed=profileSeeds[this.mixCounter%profileSeeds.length]}else if(librarySeeds.length)seed=librarySeeds[this.mixCounter%librarySeeds.length];else{discovery=true;seed={id:'musikbot187-discovery',title:'Startmix',source:'youtube'};}}
    else if(profileSeeds.length>0&&(current?.autoplayMode==='similar'||this.mixCounter%3===2)){useProfile=true;seed=profileSeeds[this.mixCounter%profileSeeds.length]}
    this.mixCounter++;
    const seedKey=autoplayTrackKey(seed);
    if(seedKey!==this.lastSeedKey){
      this.lastSeedKey=seedKey;
      this.lastSeedTitle=hasMusicPreferences?[...preferredStyles,...preferredArtists].join(', '):String(seed.title||'Aktueller Titel');
      if(!current?.autoplay||current?.autoplayMode!=='similar')this.recommendationBuffer=[];
    }
    const queued=[current,...this.player.queue].filter(Boolean),used=new Set([...queued.map(autoplayTrackKey),...this.recentKeys].filter(Boolean)),positiveProfile=this.profile.tracks.filter(track=>listeningSignalWeight(track)>0&&!this.profileTrackExcluded(track)),dislikedProfile=this.profile.tracks.filter(track=>listeningSignalWeight(track)<=0&&(Number(track.earlySkips)>0||Number(track.rating)<0)),dislikedKeys=new Set(dislikedProfile.map(autoplayTrackKey).filter(Boolean)),profileKeys=new Set(positiveProfile.map(autoplayTrackKey).filter(Boolean)),familyReferences=[...queued,...this.recentFamilies];
    const recentPosition=track=>this.recentKeys.lastIndexOf(autoplayTrackKey(track));
    const familiar=[...positiveProfile].filter(track=>!queued.some(item=>autoplayTrackKey(item)===autoplayTrackKey(track)||sameRecommendationFamily(item,track))&&autoplayMusicCandidateAllowed(track,this.profile.blockedStyles))
      .sort((a,b)=>recentPosition(a)-recentPosition(b)||listeningSignalWeight(b)-listeningSignalWeight(a)||Number(b.lastPlayed||0)-Number(a.lastPlayed||0));
    const newAllowed=track=>!used.has(autoplayTrackKey(track))&&!profileKeys.has(autoplayTrackKey(track))&&!positiveProfile.some(item=>sameRecommendationFamily(item,track))&&!this.profileTrackExcluded(track)&&!dislikedKeys.has(autoplayTrackKey(track))&&autoplayMusicCandidateAllowed(track,this.profile.blockedStyles)&&autoplayCandidateMatchesPreferences(track,{preferredStyles,preferredArtists,strictStyle:true});
    this.recommendationBuffer=this.recommendationBuffer.filter(newAllowed);
    let inspectedCandidates=0;
    if(this.recommendationBuffer.length<needed&&(hasMusicPreferences||!positiveProfile.length)){
      const blockedSuffix=this.profile.blockedStyles.map(style=>'-'+(/\s/.test(style)?'"'+style.replaceAll('"','')+'"':style)).join(' '),searchVariant=autoplaySearchVariants[mixIndex%autoplaySearchVariants.length],queryCandidates=[];
      if(hasMusicPreferences){
        const categories=[],categoryLength=Math.max(preferredStyles.length,preferredArtists.length);
        for(let index=0;index<categoryLength;index++){
          if(preferredStyles[index])categories.push({style:preferredStyles[index],artist:''});
          if(preferredArtists[index])categories.push({style:'',artist:preferredArtists[index]});
        }
        const rotated=categories.length?[...categories.slice(mixIndex%categories.length),...categories.slice(0,mixIndex%categories.length)]:[];
        for(const [index,category] of rotated.slice(0,Math.min(5,rotated.length)).entries()){
          const variant=autoplaySearchVariants[(mixIndex+index)%autoplaySearchVariants.length];
          queryCandidates.push(category.style
            ?{...category,explore:false,query:[category.style,variant,'verschiedene Künstler official audio music',blockedSuffix,autoplayNonMusicSearchSuffix].filter(Boolean).join(' ')}
            :{...category,explore:false,query:[category.artist,variant,'Songs ähnliche Künstler official audio music',blockedSuffix,autoplayNonMusicSearchSuffix].filter(Boolean).join(' ')});
        }
        const exploreCategory=rotated[(mixIndex+3)%rotated.length];
        if(exploreCategory)queryCandidates.push(exploreCategory.style
          ?{...exploreCategory,explore:true,query:[exploreCategory.style,'neue Künstler Geheimtipps','official audio music',blockedSuffix,autoplayNonMusicSearchSuffix].filter(Boolean).join(' ')}
          :{...exploreCategory,explore:true,query:[exploreCategory.artist,'ähnliche neue Künstler Geheimtipps','official audio music',blockedSuffix,autoplayNonMusicSearchSuffix].filter(Boolean).join(' ')});
      }else{
        const primaryQuery=[recommendationQuery(seed),searchVariant,'official audio music',blockedSuffix,autoplayNonMusicSearchSuffix].filter(Boolean).join(' ');
        queryCandidates.push({query:primaryQuery,style:'',artist:''},...autoplayDiscoveryQueries.map(query=>({query:[query,'official audio',blockedSuffix,autoplayNonMusicSearchSuffix].filter(Boolean).join(' '),style:'',artist:''})));
      }
      const querySpecs=[],queryKeys=new Set();
      for(const spec of queryCandidates){const query=String(spec.query||'').trim(),key=query.toLocaleLowerCase('de-DE');if(!query||queryKeys.has(key))continue;queryKeys.add(key);querySpecs.push({...spec,query});}
      if(!querySpecs.length){
        this.statusCode='waiting';
        this.detail='Der aktuelle Titel enthält zu wenig Angaben für ähnliche Vorschläge.';
        return [];
      }
      const failures=[],candidateKeys=new Set([...used,...this.recommendationBuffer.map(autoplayTrackKey).filter(Boolean)]),acceptedReferences=[],bucketLimit=hasMusicPreferences?Math.max(2,Math.min(8,Math.ceil((needed+config.queueTarget)/Math.max(1,querySpecs.length)))):Math.min(20,Math.max(needed,config.queueTarget*2));
      const processResults=(spec,found)=>{
        const fresh=[],matchOptions=spec.style
          ?{preferredStyles:[spec.style],preferredArtists:[],queryStyle:spec.style,rank:0,strictStyle:true}
          :spec.artist
            ?{preferredStyles,preferredArtists:[spec.artist],queryArtist:spec.artist,rank:0,strictStyle:true}
            :{preferredStyles,preferredArtists,rank:0};
        for(const [rank,track] of (Array.isArray(found)?found:[]).entries()){
          inspectedCandidates++;
          const key=autoplayTrackKey(track),options={...matchOptions,rank};
          if(!key||candidateKeys.has(key)||this.profile.excludedTracks.some(item=>item.key===key)||dislikedKeys.has(key)||dislikedProfile.some(item=>sameRecommendationFamily(item,track))||!autoplayMusicCandidateAllowed(track,this.profile.blockedStyles)||!autoplayCandidateMatchesPreferences(track,options)||familyReferences.some(item=>sameRecommendationFamily(item,track))||acceptedReferences.some(item=>sameRecommendationFamily(item,track))||fresh.some(item=>sameRecommendationFamily(item,track)))continue;
          const tagged={...track,autoplayCategory:spec.style||spec.artist||'',autoplayCategoryKind:spec.style?'genre':spec.artist?'artist':'',autoplayExploration:Boolean(spec.explore)};
          if(profileKeys.has(key)||positiveProfile.some(item=>sameRecommendationFamily(item,track))){candidateKeys.add(key);continue}
          fresh.push(tagged);acceptedReferences.push(tagged);candidateKeys.add(key);
          if(fresh.length>=bucketLimit)break;
        }
        return fresh;
      };
      const buckets=[],explorationBuckets=[];
      if(hasMusicPreferences){
        const searched=[];
        for(let index=0;index<querySpecs.length;index+=3){
          const batch=await Promise.all(querySpecs.slice(index,index+3).map(async spec=>{
            try{return {spec,found:await this.recommend(seed,{query:spec.query,limit:Math.max(8,Math.min(24,bucketLimit*4))})}}
            catch(error){failures.push(String(error?.message||error));return {spec,found:[]}}
          }));
          searched.push(...batch);
        }
        for(const result of searched)(result.spec.explore?explorationBuckets:buckets).push(processResults(result.spec,result.found));
        if(querySpecs.length===1&&!buckets[0]?.length){
          const spec=querySpecs[0],variant=autoplaySearchVariants[(mixIndex+1)%autoplaySearchVariants.length],query=spec.style
            ?[spec.style,variant,'verschiedene Künstler official audio music',blockedSuffix,autoplayNonMusicSearchSuffix].filter(Boolean).join(' ')
            :[spec.artist,variant,'Songs ähnliche Künstler official audio music',blockedSuffix,autoplayNonMusicSearchSuffix].filter(Boolean).join(' ');
          try{buckets.push(processResults({...spec,query},await this.recommend(seed,{query,limit:Math.max(8,Math.min(24,bucketLimit*4))})))}
          catch(error){failures.push(String(error?.message||error))}
        }
      }else{
        for(const spec of querySpecs){
          let found=[];
          try{found=await this.recommend(seed,{query:spec.query,limit:Math.max(8,Math.min(24,bucketLimit*4))})}catch(error){failures.push(String(error?.message||error));continue}
          const bucket=processResults(spec,found);buckets.push(bucket);
          if(bucket.length)break;
        }
      }
      const core=[],exploration=[];
      for(let index=0;buckets.some(bucket=>index<bucket.length);index++)for(const bucket of buckets)if(bucket[index])core.push(bucket[index]);
      for(let index=0;explorationBuckets.some(bucket=>index<bucket.length);index++)for(const bucket of explorationBuckets)if(bucket[index])exploration.push(bucket[index]);
      if(generation!==this.generation||!this.settings.autoplayEnabled)return [];
      // Both search kinds are discoveries. Known songs come directly from the
      // learned library, never from hoping YouTube returns an old favorite.
      while(core.length||exploration.length){
        if(core.length)this.recommendationBuffer.push(core.shift());
        if(exploration.length)this.recommendationBuffer.push(exploration.shift());
      }
      if(!this.recommendationBuffer.length&&!familiar.length&&failures.length>=querySpecs.length)throw new Error('YouTube-Suche für den Musikmix fehlgeschlagen: '+failures.at(-1));
    }
    const items=[],selected=[...queued];
    const targetKnown=Math.ceil(config.queueTarget/2)+(!current&&this.player.queue.length===0?1:0);
    let knownNeeded=Math.max(0,targetKnown-this.player.queue.filter(track=>track.autoplayKnownFavorite).length);
    const take=list=>{
      while(list.length){
        const track=list.shift();
        if(!selected.some(item=>autoplayTrackKey(item)===autoplayTrackKey(track)||sameRecommendationFamily(item,track)))return track;
      }
      return null;
    };
    while(items.length<needed){
      const preferKnown=knownNeeded>0&&(items.length===0||!items.at(-1).autoplayKnownFavorite||needed-items.length<=knownNeeded);
      let track=preferKnown?take(familiar):take(this.recommendationBuffer),known=preferKnown;
      if(!track){known=!preferKnown;track=take(known?familiar:this.recommendationBuffer)}
      if(!track)break;
      if(known){knownNeeded--;track={...track,autoplayCategory:learnedArtistCandidate(track)||track.styles?.[0]||'Gelernter Favorit',autoplayCategoryKind:'profile'}}
      else track={...track,autoplayExploration:true};
      const key=autoplayTrackKey(track);
      selected.push(track);
      this.recentKeys.push(key);
      if(this.recentKeys.length>250)this.recentKeys.splice(0,this.recentKeys.length-250);
      this.recentFamilies.push({title:track.title});
      if(this.recentFamilies.length>250)this.recentFamilies.splice(0,this.recentFamilies.length-250);
      this.profile.recentAutoplay.push({key,title:String(track.title||'').slice(0,200)});
      if(this.profile.recentAutoplay.length>250)this.profile.recentAutoplay.splice(0,this.profile.recentAutoplay.length-250);
      items.push({...track,autoplay:true,autoplayMode:'similar',autoplayKnownFavorite:known,autoplayExploration:!known,autoplaySeed:this.lastSeedTitle,autoplayFromProfile:known||useProfile});
    }
    if(items.length)await this.save();
    if(!items.length){
      this.statusCode='waiting';
      const subject=hasMusicPreferences?'Für '+preferences.label+' ('+this.lastSeedTitle+')':'Zu „'+this.lastSeedTitle+'“';
      this.detail=inspectedCandidates?subject+' wurden '+inspectedCandidates+' YouTube-Treffer geprüft, aber gerade keine passenden neuen Musiktitel gefunden. In 30 Sekunden wird automatisch mit einer anderen Suche erneut gesucht.':subject+' hat YouTube gerade keine Suchtreffer geliefert. In 30 Sekunden wird automatisch mit einer anderen Suche erneut gesucht.';
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
    this.player.off('track-end',this.onTrackEnd);
  }
}
