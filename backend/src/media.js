import fs from 'node:fs/promises';
import {musicArtist,musicSlowedVersion} from './music-identity.js';
import {isYouTubeAccessBlocked,sharedYouTubeAccess} from './youtube-access.js';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {assertSafeExternalUrl,safeMusicPath,safeMusicRelativePath} from './security.js';
export {assertSafeExternalUrl};
export const audioExtensions=new Set(['.mp3','.wav','.flac','.ogg','.opus','.m4a','.aac','.webm']);
export const youtubeRuntimeArgs=['--ignore-config','--socket-timeout','8','--extractor-retries','1','--js-runtimes','node','--remote-components','ejs:github'];
export const youtubeSearchStrategies=[['--extractor-args','youtubetab:skip=webpage'],[]];
export const youtubeClientStrategies=[[],['--extractor-args','youtube:player_client=web_safari'],['--extractor-args','youtube:player_client=web_embedded']];
export const searchResultLimit=50;
export const bestAudioFormat='bestaudio[protocol=https]/bestaudio[protocol=http]/bestaudio/best';
export const youtubePlaybackPrintTemplate='%(url)s\t%(duration)s\t%(protocol)s\t%(id)s';
const externalRequestTimeoutMs=15_000,youtubeResolveTimeoutMs=60_000,youtubeAttemptTimeoutMs=20_000,spotifyPublicEmbedMaxBytes=2*1024*1024,spotifyAppTokenCaches=new WeakMap(),spotifyPlaybackCache=new Map(),youtubeVideoIdPattern=/^[A-Za-z0-9_-]{11}$/;
const youtubeAccess=sharedYouTubeAccess;
function run(command,args,options={}){return command==='yt-dlp'?youtubeAccess.run(()=>runProcess(command,args,options),{signal:options.signal,recoverOnSuccess:!args.includes('--flat-playlist')}):runProcess(command,args,options);}
const headers=[Buffer.from('ID3'),Buffer.from('RIFF'),Buffer.from('fLaC'),Buffer.from('OggS'),Buffer.from([0xff,0xfb]),Buffer.from([0xff,0xf3]),Buffer.from([0xff,0xf2]),Buffer.from([0x1a,0x45,0xdf,0xa3])];
export async function validateAudioFile(file){const h=Buffer.alloc(16);const fd=await fs.open(file,'r');try{await fd.read(h,0,h.length,0);}finally{await fd.close();}if(!headers.some(x=>h.subarray(0,x.length).equals(x))&&!h.subarray(4,8).equals(Buffer.from('ftyp')))throw new Error('Dateiheader ist kein unterstütztes Audioformat');}
export async function listMusic(root){await fs.mkdir(root,{recursive:true});const entries=await fs.readdir(root,{withFileTypes:true});const out=[];for(const e of entries){if(!e.isFile())continue;const p=safeMusicPath(root,e.name);const s=await fs.stat(p);out.push({id:`local:${e.name}`,title:e.name,source:'local',path:e.name,size:s.size});}return out;}
export async function listDownloads(root){const folder=path.join(root,'Downloads');await fs.mkdir(folder,{recursive:true});return (await listMusic(folder)).map(item=>({...item,id:`local:Downloads/${item.path}`,path:`Downloads/${item.path}`,downloaded:true}));}
export async function musicBytes(root){let total=0;const walk=async folder=>{for(const entry of await fs.readdir(folder,{withFileTypes:true}).catch(()=>[])){const file=path.join(folder,entry.name);if(entry.isDirectory()){if(!entry.name.startsWith('.incoming-'))await walk(file);continue}if(entry.isFile()&&audioExtensions.has(path.extname(entry.name).toLowerCase()))total+=(await fs.stat(file)).size;}};await walk(root);return total;}
export async function cleanupDownloadTemps(downloadsDir,{now=Date.now(),maxAgeMs=60*60*1000}={}){let removed=0;for(const entry of await fs.readdir(downloadsDir,{withFileTypes:true}).catch(()=>[])){if(!entry.isDirectory()||!entry.name.startsWith('.incoming-'))continue;const folder=path.join(downloadsDir,entry.name),stat=await fs.stat(folder).catch(()=>null);if(stat&&now-stat.mtimeMs>=maxAgeMs){await fs.rm(folder,{recursive:true,force:true});removed++;}}return removed;}
function runProcess(command,args,{timeout=20000,max=1024*1024,signal}={}){return new Promise((resolve,reject)=>{const child=spawn(command,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let out=Buffer.alloc(0),err='',settled=false,timedOut=false;const finish=(callback,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);callback(value);};const abort=()=>{child.kill('SIGKILL');const error=new Error('Medienauflösung abgebrochen');error.name='AbortError';finish(reject,error);};const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeout);if(signal?.aborted)return abort();signal?.addEventListener('abort',abort,{once:true});child.stdout.on('data',b=>{out=Buffer.concat([out,b]);if(out.length>max){err='Antwort der Medienauflösung ist zu groß';child.kill('SIGKILL');}});child.stderr.on('data',b=>{err=(err+b).slice(-4096);});child.on('error',error=>finish(reject,error));child.on('close',code=>{if(code===0)return finish(resolve,out.toString());finish(reject,new Error(timedOut?`${command} Zeitüberschreitung`:err||`${command} exit ${code}`));});});}
async function boundedResponseText(response,maxBytes){const declared=Number(response.headers?.get?.('content-length'));if(Number.isFinite(declared)&&declared>maxBytes)throw new Error('Die öffentliche Spotify-Antwort ist unerwartet groß.');if(!response.body?.getReader){const text=await response.text();if(Buffer.byteLength(text)>maxBytes)throw new Error('Die öffentliche Spotify-Antwort ist unerwartet groß.');return text}const reader=response.body.getReader(),chunks=[];let total=0;try{while(true){const {done,value}=await reader.read();if(done)break;const chunk=Buffer.from(value);total+=chunk.length;if(total>maxBytes){await reader.cancel().catch(()=>{});throw new Error('Die öffentliche Spotify-Antwort ist unerwartet groß.')}chunks.push(chunk)}}finally{reader.releaseLock?.()}return Buffer.concat(chunks,total).toString('utf8');}
export function parseYouTubeDownloadUrl(raw){const value=String(raw||'').trim();if(value.length<10||value.length>500)throw new Error('Bitte einen gültigen YouTube-Link einfügen.');let url;try{url=new URL(value)}catch{throw new Error('Bitte einen gültigen YouTube-Link einfügen.')}const host=url.hostname.toLowerCase(),youtubeHosts=new Set(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com']),shortHost=host==='youtu.be';if(url.protocol!=='https:'||!youtubeHosts.has(host)&&!shortHost||url.username||url.password)throw new Error('Es sind ausschließlich HTTPS-Links zu YouTube-Videos erlaubt.');const id=shortHost?url.pathname.split('/').filter(Boolean)[0]:url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})(?:\/|$)/)?.[1];if(!/^[A-Za-z0-9_-]{11}$/.test(String(id||'')))throw new Error('Der Link enthält keine gültige YouTube-Video-ID. Playlists werden hier nicht komplett heruntergeladen.');return `https://www.youtube.com/watch?v=${id}`;}
export function youtubeDownloadArgs(url,template,maxBytes){return [...youtubeRuntimeArgs,'--no-playlist','--force-ipv4','--restrict-filenames','--trim-filenames','140','--no-overwrites','--no-progress','--max-filesize',String(maxBytes),'-f',bestAudioFormat,'-o',template,url];}
export function normalizeDownloadedFilename(raw){const original=path.basename(String(raw||'')),originalExtension=path.extname(original),extension=originalExtension.toLowerCase();if(!audioExtensions.has(extension))throw new Error('YouTube hat kein unterstütztes Audioformat geliefert.');const stem=path.basename(original,originalExtension).normalize('NFKC').replace(/\.\.+/g,'_').replace(/[^\p{L}\p{N} _().\-[\]]+/gu,'_').replace(/_+/g,'_').replace(/\s+/g,' ').replace(/\s*_\s*/g,'_').replace(/^[ ._-]+|[ ._-]+$/g,'').slice(0,160)||'YouTube_Audio';return `${stem}${extension}`;}
export async function downloadYouTubeAudio(raw,downloadsDir,{maxBytes=128*1024*1024}={}){const url=parseYouTubeDownloadUrl(raw);await fs.mkdir(downloadsDir,{recursive:true});const temp=await fs.mkdtemp(path.join(downloadsDir,'.incoming-'));try{const template=path.join(temp,'%(title).100B_[%(id)s].%(ext)s');await run('yt-dlp',youtubeDownloadArgs(url,template,maxBytes),{timeout:10*60_000,max:64*1024});const candidates=(await fs.readdir(temp,{withFileTypes:true})).filter(entry=>entry.isFile()&&audioExtensions.has(path.extname(entry.name).toLowerCase()));if(candidates.length!==1)throw new Error(candidates.length?'YouTube hat mehrere unerwartete Audiodateien geliefert.':'YouTube hat keine herunterladbare Audiodatei geliefert.');const originalName=candidates[0].name,name=normalizeDownloadedFilename(originalName),resolved=path.join(temp,originalName),stat=await fs.stat(resolved);if(stat.size<=0||stat.size>maxBytes)throw new Error('Der YouTube-Download überschreitet die erlaubte Dateigröße.');await validateAudioFile(resolved);const target=safeMusicPath(downloadsDir,name);try{await fs.link(resolved,target)}catch(error){if(error.code!=='EEXIST')throw error}const finalStat=await fs.stat(target);return {id:`local:Downloads/${name}`,title:name,source:'local',path:`Downloads/${name}`,size:finalStat.size,downloaded:true};}finally{await fs.rm(temp,{recursive:true,force:true});}}
export function youtubeSearchUrl(query){const value=String(query||'').trim().slice(0,300);if(!value)throw new Error('YouTube-Suchbegriff fehlt.');return `https://www.youtube.com/results?search_query=${encodeURIComponent(value)}`;}
export function canonicalYouTubeVideoUrl(id,raw=''){const direct=String(id||'').replace(/^yt:/i,'');if(youtubeVideoIdPattern.test(direct))return `https://www.youtube.com/watch?v=${direct}`;try{const url=new URL(String(raw||'')),host=url.hostname.toLowerCase(),candidate=host==='youtu.be'?url.pathname.split('/').filter(Boolean)[0]:['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host)?url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})(?:\/|$)/)?.[1]:'';return youtubeVideoIdPattern.test(String(candidate||''))?`https://www.youtube.com/watch?v=${candidate}`:''}catch{return''}}
export function playbackYouTubePageUrl(item){
  if(item?.source==='youtube')return canonicalYouTubeVideoUrl(item.id,item.url);
  if(item?.source==='spotify')return canonicalYouTubeVideoUrl(item.playbackVideoId||item.playbackMatch?.id);
  return '';
}
export function youtubePlaybackPipeArgs(url){
  const page=canonicalYouTubeVideoUrl('',url);
  if(!page)throw new Error('Für die YouTube-Wiedergabe fehlt eine gültige Video-ID.');
  return [...youtubeRuntimeArgs,'--no-playlist','--force-ipv4','--no-progress','--retries','3','--fragment-retries','3','--retry-sleep','http:0.25','--retry-sleep','fragment:0.25','--abort-on-unavailable-fragments','-f',bestAudioFormat,'-o','-',page];
}
export function youtubeSearchArtist(entry){return musicArtist(entry);}
async function youtubeSearchData(query,limit,timeout,signal){const deadline=Date.now()+Math.max(1000,Number(timeout)||30_000),failures=[];for(const strategy of youtubeSearchStrategies){const remaining=deadline-Date.now();if(remaining<=0)break;try{const raw=await run('yt-dlp',[...youtubeRuntimeArgs,'--dump-single-json','--flat-playlist','--playlist-end',String(limit),'--force-ipv4',...strategy,youtubeSearchUrl(query)],{timeout:Math.min(youtubeAttemptTimeoutMs,remaining),signal});return JSON.parse(raw)}catch(error){if(error.name==='AbortError'||isYouTubeAccessBlocked(error))throw error;failures.push(error.message)}}throw new Error(`YouTube-Suche konnte nicht abgeschlossen werden. ${failures.at(-1)||'Zeitüberschreitung'}`);}
export async function youtubeSearch(query,{limit=searchResultLimit,timeout=30_000,signal}={}){limit=Math.max(1,Math.min(searchResultLimit,Number(limit)||searchResultLimit));const json=await youtubeSearchData(query,limit,timeout,signal);return (json.entries||[]).map(x=>{const url=canonicalYouTubeVideoUrl(x.id,x.url);return url?{id:new URL(url).searchParams.get('v'),title:x.title,artist:youtubeSearchArtist(x),channel:String(x.channel||x.uploader||''),url,source:'youtube',duration:x.duration,thumbnail:x.thumbnail,quality:'Beste verfügbare Audioqualität'}:null}).filter(Boolean).slice(0,limit);}
export function selectHighestQualityStations(stations,limit=searchResultLimit){const seen=new Set(),selected=[];for(const station of [...stations].sort((a,b)=>Number(b.bitrate||0)-Number(a.bitrate||0))){const identity=[station.name,station.countrycode,station.state].map(value=>String(value||'').trim().toLocaleLowerCase('de-DE')).join('|'),key=identity==='||'?String(station.stationuuid||station.url_resolved||station.url):identity;if(seen.has(key))continue;seen.add(key);selected.push(station);if(selected.length>=limit)break}return selected;}
export async function radioSearch(query){const candidateLimit=searchResultLimit*4,url=await assertSafeExternalUrl(`https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(query)}&order=bitrate&reverse=true&limit=${candidateLimit}&hidebroken=true`);const res=await fetch(url,{headers:{'user-agent':'MusikBot187/1.8.7'},signal:AbortSignal.timeout(externalRequestTimeoutMs)});if(!res.ok)throw new Error('Radio-Browser nicht erreichbar');return selectHighestQualityStations(await res.json()).map(x=>({id:x.stationuuid,title:x.name,url:x.url_resolved||x.url,source:'radio',thumbnail:x.favicon,bitrate:Number(x.bitrate||0),codec:String(x.codec||''),quality:[x.codec,Number(x.bitrate)>0?`${Number(x.bitrate)} kbit/s`:null].filter(Boolean).join(' · ')||'Beste verfügbare Streamvariante'}));}
async function spotifyToken(id,secret,fetcher=fetch,{force=false}={}){if(!id||!secret)throw new Error('Spotify Client-ID und Client-Secret fehlen. Bitte zuerst auf der Spotify-Seite speichern.');let cache=spotifyAppTokenCaches.get(fetcher);if(!cache){cache=new Map();spotifyAppTokenCaches.set(fetcher,cache)}const key=`${id}\0${secret}`,cached=cache.get(key);if(!force&&cached?.expires>Date.now()+30_000)return cached.token;const tokenRes=await fetcher('https://accounts.spotify.com/api/token',{method:'POST',headers:{authorization:`Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,'content-type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(externalRequestTimeoutMs)});if(!tokenRes.ok)throw new Error('Spotify-Anmeldung fehlgeschlagen. Bitte Client-ID und Client-Secret prüfen.');const body=await tokenRes.json(),token=body.access_token;if(!token)throw new Error('Spotify hat kein App-Zugriffstoken geliefert.');cache.set(key,{token,expires:Date.now()+Math.max(60,Number(body.expires_in)||3600)*1000});return token;}
export async function verifySpotifyAppCredentials(id,secret,{fetcher=fetch}={}){await spotifyToken(id,secret,fetcher,{force:true});return {ok:true};}
export const spotifyUserScopes=['playlist-read-private','playlist-read-collaborative','user-read-private'];
export function validSpotifyRedirectUri(raw){try{const url=new URL(String(raw||''));const loopback=['127.0.0.1','[::1]','::1'].includes(url.hostname);return url.pathname==='/api/spotify/callback'&&!url.username&&!url.password&&!url.search&&!url.hash&&(url.protocol==='https:'||url.protocol==='http:'&&loopback);}catch{return false;}}
async function spotifyTokenResponse(parameters,id,secret,fetcher=fetch){if(!id||!secret)throw new Error('Spotify Client-ID und Client-Secret fehlen. Bitte zuerst auf der Spotify-Seite speichern.');const response=await fetcher('https://accounts.spotify.com/api/token',{method:'POST',headers:{authorization:`Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(parameters).toString(),signal:AbortSignal.timeout(externalRequestTimeoutMs)});let body={};try{body=await response.json();}catch{}if(!response.ok)throw new Error(body.error_description||(typeof body.error==='string'?body.error:body.error?.message)||'Spotify-Anmeldung fehlgeschlagen. Bitte App-Daten und Callback-Adresse prüfen.');if(!body.access_token)throw new Error('Spotify hat kein Zugriffstoken geliefert.');return body;}
export async function exchangeSpotifyAuthorizationCode({id,secret,code,redirectUri,verifier},fetcher=fetch){return spotifyTokenResponse({grant_type:'authorization_code',code,redirect_uri:redirectUri,code_verifier:verifier},id,secret,fetcher);}
export async function refreshSpotifyUserToken({id,secret,refreshToken},fetcher=fetch){return spotifyTokenResponse({grant_type:'refresh_token',refresh_token:refreshToken},id,secret,fetcher);}
async function spotifyJson(url,token,fetcher=fetch){const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.hostname!=='api.spotify.com')throw new Error('Ungültiges Spotify-API-Ziel.');const res=await fetcher(parsed,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(externalRequestTimeoutMs)});if(!res.ok){let detail='',reason='';try{const body=await res.json();detail=body?.error?.message||body?.error_description||'';reason=body?.error?.reason||body?.reason||'';}catch{}const accountRequest=parsed.pathname==='/v1/me'||parsed.pathname==='/v1/me/playlists',fail=message=>{const error=new Error(message);error.spotifyStatus=res.status;throw error};if(res.status===401||/valid user authentication required/i.test(detail))fail('Spotify-Benutzeranmeldung erforderlich. Bitte Spotify auf der Spotify-Seite neu verbinden.');if(res.status===403&&accountRequest)fail('Spotify verweigert den Kontozugriff. Prüfe im Spotify Developer Dashboard, ob der App-Eigentümer Premium besitzt und dieses Spotify-Konto als zugelassener Nutzer der App eingetragen ist. Trenne und verbinde Spotify danach im MusikBot neu.');if(res.status===403)fail('Spotify gibt Playlist-Titel seit Februar 2026 nur noch für Playlists frei, die dem verbundenen Spotify-Konto gehören oder an denen es mitwirkt. Für eine öffentliche Playlist versucht MusikBot187 anschließend automatisch die öffentliche Spotify-Ansicht.');if(res.status===404&&accountRequest)fail('Spotify konnte das verbundene Benutzerkonto nicht lesen. Trenne Spotify im MusikBot, prüfe den zugelassenen Nutzer der Spotify-App und verbinde das Konto anschließend neu.');if(res.status===404)fail('Spotify hat diese Playlist über die Benutzer-API nicht gefunden. Für eine öffentliche Playlist versucht MusikBot187 anschließend automatisch die öffentliche Spotify-Ansicht.');if(res.status===429)fail(`Spotify-Limit erreicht${reason==='QUOTA_EXCEEDED'?' (Tageskontingent der Spotify-App ausgeschöpft)':detail?`: ${detail}`:'. Bitte später erneut versuchen.'}`);fail(detail||`Spotify-Anfrage fehlgeschlagen (HTTP ${res.status}).`);}return res.json();}
function spotifyTrack(track){if(!track||track.type&&track.type!=='track')return null;return {id:track.id,title:`${(track.artists||[]).map(artist=>artist.name).filter(Boolean).join(', ')} – ${track.name}`.replace(/^ – /,''),source:'spotify',url:track.external_urls?.spotify||'',duration:Math.round(Number(track.duration_ms||0)/1000),thumbnail:track.album?.images?.at(-1)?.url||'',quality:'Beste verfügbare Audioqualität'};}
export async function spotifySearch(query,id,secret,{fetcher=fetch}={}){if(!id||!secret)return[];const token=await spotifyToken(id,secret,fetcher),items=[];for(let offset=0;offset<searchResultLimit;offset+=10){const page=await spotifyJson(`https://api.spotify.com/v1/search?type=track&limit=10&market=DE&offset=${offset}&q=${encodeURIComponent(query)}`,token,fetcher),tracks=page.tracks?.items||[];items.push(...tracks.map(spotifyTrack).filter(Boolean));if(tracks.length<10)break;}return items.slice(0,searchResultLimit);}
export function parseSpotifyPlaylistId(raw){const value=String(raw||'').trim();const uri=value.match(/^spotify:playlist:([A-Za-z0-9]{10,40})$/i);if(uri)return uri[1];try{const url=new URL(value);if(url.protocol==='https:'&&['open.spotify.com','play.spotify.com'].includes(url.hostname)){const match=url.pathname.match(/^\/playlist\/([A-Za-z0-9]{10,40})(?:\/|$)/);if(match)return match[1];}}catch{}throw new Error('Bitte einen gültigen Spotify-Playlist-Link einfügen.');}
export async function listSpotifyUserPlaylists(token,{fetcher=fetch,maxItems=500}={}){if(!token)throw new Error('Spotify-Benutzeranmeldung erforderlich. Bitte Spotify auf der Spotify-Seite verbinden.');const profile=await spotifyJson('https://api.spotify.com/v1/me',token,fetcher),playlists=[];let page=await spotifyJson('https://api.spotify.com/v1/me/playlists?limit=50',token,fetcher);while(page&&playlists.length<maxItems){for(const playlist of page.items||[]){if(!playlist?.id)continue;const owned=playlist.owner?.id===profile.id,collaborative=Boolean(playlist.collaborative);playlists.push({id:playlist.id,name:String(playlist.name||'Spotify-Playlist').slice(0,80),url:playlist.external_urls?.spotify||`https://open.spotify.com/playlist/${playlist.id}`,owner:playlist.owner?.display_name||playlist.owner?.id||'',owned,collaborative,importable:owned||collaborative,public:playlist.public,itemCount:Number(playlist.items?.total??playlist.tracks?.total??0)});if(playlists.length>=maxItems)break;}page=page.next?await spotifyJson(page.next,token,fetcher):null;}return {user:{id:profile.id||'',displayName:profile.display_name||profile.id||'Spotify-Konto',product:profile.product||''},playlists};}
export async function importSpotifyPublicEmbedPlaylist(playlistId,{fetcher=fetch,maxItems=500}={}){
  if(!/^[A-Za-z0-9]{10,40}$/.test(String(playlistId||'')))throw new Error('Die öffentliche Spotify-Playlist-ID ist ungültig.');
  maxItems=Math.max(1,Math.min(500,Number(maxItems)||500));
  const sourceUrl=`https://open.spotify.com/playlist/${playlistId}`,embedUrl=`https://open.spotify.com/embed/playlist/${playlistId}`,response=await fetcher(embedUrl,{headers:{accept:'text/html,application/xhtml+xml','accept-language':'de-DE,de;q=0.9,en;q=0.7','user-agent':'MusikBot187/1.8.7'},signal:AbortSignal.timeout(externalRequestTimeoutMs)});
  if(!response.ok)throw new Error(`Die öffentliche Spotify-Ansicht ist nicht erreichbar (HTTP ${response.status}).`);
  const html=await boundedResponseText(response,spotifyPublicEmbedMaxBytes);
  const match=html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if(!match)throw new Error('Spotify stellt für diese Playlist keine öffentliche Titelliste bereit.');
  let entity;try{entity=JSON.parse(match[1])?.props?.pageProps?.state?.data?.entity}catch{throw new Error('Die öffentliche Spotify-Titelliste konnte nicht gelesen werden.')}
  if(entity?.type!=='playlist'||entity?.id!==playlistId||!Array.isArray(entity.trackList))throw new Error('Spotify stellt für diese Playlist keine passende öffentliche Titelliste bereit.');
  const items=[];
  for(const entry of entity.trackList){const id=String(entry?.uri||'').match(/^spotify:track:([A-Za-z0-9]{10,40})$/)?.[1];if(!id||!entry?.title)continue;const artist=String(entry.subtitle||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim().slice(0,160),title=String(entry.title).replace(/\s+/g,' ').trim().slice(0,200);items.push({id,title:(artist?`${artist} – ${title}`:title).slice(0,300),source:'spotify',url:`https://open.spotify.com/track/${id}`,duration:Math.round(Math.max(0,Number(entry.duration)||0)/1000),thumbnail:'',quality:'Beste verfügbare Audioqualität'});if(items.length>=maxItems)break}
  if(!items.length)throw new Error('Die öffentliche Spotify-Playlist enthält keine lesbaren Musiktitel.');
  return {name:String(entity.name||entity.title||'Spotify-Playlist').slice(0,80),items,source:'spotify',sourceUrl,thumbnail:entity.coverArt?.sources?.at(-1)?.url||'',spotifyId:playlistId,spotifyImportMode:'public-embed'};
}
export async function importSpotifyPlaylist(raw,token,{fetcher=fetch,maxItems=500}={}){if(!token)throw new Error('Spotify-Benutzeranmeldung erforderlich. Bitte Spotify auf der Spotify-Seite verbinden.');const playlistId=parseSpotifyPlaylistId(raw);try{const data=await spotifyJson(`https://api.spotify.com/v1/playlists/${playlistId}?market=DE`,token,fetcher);if(data?.id&&data.id!==playlistId)throw new Error('Spotify hat eine unerwartete Playlist-ID geliefert. Bitte den Link erneut aus Spotify kopieren.');const items=[];let page=Array.isArray(data?.items?.items)?data.items:await spotifyJson(`https://api.spotify.com/v1/playlists/${playlistId}/items?market=DE&limit=50&additional_types=track`,token,fetcher);while(page&&items.length<maxItems){for(const entry of page.items||[]){const track=spotifyTrack(entry.item||entry.track);if(track)items.push(track);if(items.length>=maxItems)break;}page=page.next?await spotifyJson(page.next,token,fetcher):null;}return {name:String(data?.name||'Spotify-Playlist').slice(0,80),items,source:'spotify',sourceUrl:data?.external_urls?.spotify||`https://open.spotify.com/playlist/${playlistId}`,thumbnail:data?.images?.at(-1)?.url||'',spotifyId:playlistId,spotifyImportMode:'api'};}catch(error){if(![403,404].includes(Number(error?.spotifyStatus)))throw error;try{return await importSpotifyPublicEmbedPlaylist(playlistId,{fetcher,maxItems})}catch(publicError){const combined=new Error(`${error.message} Öffentlicher Rückfall fehlgeschlagen: ${publicError.message}`);combined.spotifyStatus=error.spotifyStatus;throw combined}}}
export function normalizeRadioUrl(raw){return String(raw).replace(/^https?:\/\/streams?\.bigfm\.de\/bigfm-rlp-128-aac\/?(?:[?#].*)?$/i,'https://stream.bigfm.de/rlp/aac-128/stream.bigfm.de/');}
export function isPermanentYouTubeResolutionError(error){return /(?:video unavailable|not made this video available|not available in your country|private video|members[- ]only|age[- ]restricted|copyright|blocked due to|no longer available)/i.test(String(error?.message||error||''));}
export function parseResolvedYouTubeOutput(raw){const line=String(raw||'').split(/\r?\n/).find(value=>value.trim());if(!line)throw new Error('yt-dlp hat keine Audioadresse geliefert.');const [url='',durationRaw='',protocol='',id='']=line.split('\t');if(!/^https?:\/\//i.test(url))throw new Error('yt-dlp hat keine gültige Audioadresse geliefert.');const parsedDuration=Number(durationRaw),duration=Number.isFinite(parsedDuration)&&parsedDuration>0?parsedDuration:0;return {url:url.trim(),duration,protocol:String(protocol||'').trim(),id:String(id||'').trim()};}
export function spotifyPlaybackDurationToleranceSeconds(duration){const target=Math.max(0,Number(duration)||0);return target?Math.max(8,Math.min(20,target*0.08)):0;}
export function spotifyPlaybackDurationCompatible(catalogDuration,playbackDuration){const target=Math.max(0,Number(catalogDuration)||0),actual=Math.max(0,Number(playbackDuration)||0);if(!target||!actual)return true;return Math.abs(target-actual)<=spotifyPlaybackDurationToleranceSeconds(target);}
function applyResolvedPlayback(item,resolved){if(!item||!resolved)return;const original=Math.max(0,Number(item.catalogDuration??item.duration)||0);if(item.catalogDuration==null&&original>0)item.catalogDuration=original;const duration=Math.max(0,Number(resolved.duration)||0);item.playbackDuration=duration;item.playbackProtocol=String(resolved.protocol||'');item.playbackVideoId=String(resolved.id||'');item.duration=duration;}
async function resolveYoutube(q,signal,{deadline=Date.now()+youtubeResolveTimeoutMs}={}){const failures=[];for(const strategy of youtubeClientStrategies){const remaining=deadline-Date.now();if(remaining<=0)break;try{const out=await run('yt-dlp',[...youtubeRuntimeArgs,'--no-playlist','--print',youtubePlaybackPrintTemplate,'-f',bestAudioFormat,'--force-ipv4',...strategy,q],{signal,timeout:Math.min(youtubeAttemptTimeoutMs,remaining)}),resolved=parseResolvedYouTubeOutput(out);await assertSafeExternalUrl(resolved.url);return resolved;}catch(error){if(error.name==='AbortError'||isYouTubeAccessBlocked(error))throw error;failures.push(error.message);if(isPermanentYouTubeResolutionError(error))break;}}throw new Error(`YouTube-Audio konnte mit keiner Clientvariante aufgelöst werden. ${failures.at(-1)||''}`.trim());}
const spotifyPlaybackCacheKey=item=>String(item?.id||item?.title||'').trim().toLocaleLowerCase('de-DE');
const spotifyRejectedPlaybackIds=item=>new Set((Array.isArray(item?._spotifyRejectedPlaybackIds)?item._spotifyRejectedPlaybackIds:[]).map(String).filter(id=>youtubeVideoIdPattern.test(id)));
export function rejectSpotifyPlaybackMatch(item){
  if(item?.source!=='spotify')return false;
  const id=String(item.playbackVideoId||item.playbackMatch?.id||'');
  if(!youtubeVideoIdPattern.test(id))return false;
  const rejected=[id,...spotifyRejectedPlaybackIds(item)].filter((value,index,list)=>list.indexOf(value)===index).slice(0,8);
  Object.defineProperty(item,'_spotifyRejectedPlaybackIds',{value:rejected,writable:true,configurable:true,enumerable:false});
  spotifyPlaybackCache.delete(spotifyPlaybackCacheKey(item));
  delete item.playbackMatch;delete item.playbackVideoId;delete item.playbackProtocol;delete item.playbackDuration;delete item.playbackVersion;
  if(Number(item.catalogDuration)>0)item.duration=Number(item.catalogDuration);
  return true;
}
const matchingWords=value=>new Set(String(value||'').toLocaleLowerCase('de-DE').normalize('NFKD').replace(/\p{M}/gu,'').replace(/ß/g,'ss').replace(/[^\p{L}\p{N}]+/gu,' ').split(/\s+/).filter(word=>word.length>1&&!['official','video','audio','lyrics','lyric','topic','musik','music'].includes(word)));
export function spotifyPlaybackWordEquivalent(expected,actual){
  if(expected===actual)return true;
  if(expected.length<6||actual.length<6||Math.abs(expected.length-actual.length)>1||expected.slice(0,3)!==actual.slice(0,3))return false;
  let i=0,j=0,edits=0;
  while(i<expected.length&&j<actual.length){
    if(expected[i]===actual[j]){i++;j++;continue}
    if(++edits>1)return false;
    if(expected.length>actual.length)i++;
    else if(actual.length>expected.length)j++;
    else{i++;j++}
  }
  return edits+(expected.length-i)+(actual.length-j)<=1;
}
const spotifyWordCoverage=(expected,actual)=>{const words=[...expected],available=[...actual];let matches=0;for(const word of words){const index=available.findIndex(candidate=>spotifyPlaybackWordEquivalent(word,candidate));if(index>=0){matches++;available.splice(index,1)}}return matches};
const spotifyArtistCredit=(track)=>{const title=String(track?.title||''),parts=title.split(/\s+[–—-]\s+/);return parts.length>1?parts[0].trim():String(track?.artist||'').trim()};
const spotifyCandidateTitleParts=candidate=>{
  // Video credits also appear as "Artist x Artist ✖ Song". The separators must
  // be surrounded by spacing to avoid cutting ordinary names and song words.
  const parts=String(candidate?.title||'').split(/\s+[–—✖×-]\uFE0F?\s+/u);
  // Decorative segments never supply artist evidence or a different recording.
  while(parts.length>1&&/^(?:[\[(]\s*)?(?:official\s+)?(?:audio|video|lyric(?:s)?(?:\s+video)?|music\s+video|visuali[sz]er)(?:\s*[\])])?(?:\s+prod(?:uced)?\.?\s+by\s+[\p{L}\p{N}_ -]+)?$/iu.test(parts.at(-1).trim()))parts.pop();
  // Some official videos list production credits after the second separator:
  // "KC Rebell ✖ PAPER ✖ [official Video] GEE..., Nikki ...".
  // A separate artist and song segment must precede these production credits.
  if(parts.length>2&&/^[\[(]\s*(?:official\s+)?(?:video|audio|music\s+video|visuali[sz]er)\s*[\])]\s+[\p{L}\p{N}][\p{L}\p{N}\s,;&.+-]{0,100}$/iu.test(parts.at(-1).trim())&&
    !/\b(?:remix|edit|live|slowed|extended|instrumental|cover|karaoke)\b/iu.test(parts.at(-1)))parts.pop();
  return parts;
};
const spotifyBylineCredit=candidate=>{
  const title=String(candidate?.title||'').trim();
  // A producer credit in a formatted video title is NOT an artist byline.
  if(spotifyCandidateTitleParts(candidate).length>1)return null;
  const match=title.match(/^(.+?)\s+by\s+([^|｜]+?)(?:\s*[|｜]\s*(.+))?$/iu);
  if(!match||!match[1].trim()||!match[2].trim()||/\b(?:prod(?:uced)?\.?)\s*$/iu.test(match[1]))return null;
  return {song:match[1].trim(),credit:match[2].trim(),trailing:match[3]||''};
};
const spotifyCandidateCredit=candidate=>{
  const parts=spotifyCandidateTitleParts(candidate),byline=spotifyBylineCredit(candidate);
  if(byline)return byline.credit;
  if(parts.length>1)return parts[0].trim();
  return String(candidate?.artist||candidate?.channel||candidate?.uploader||'').replace(/\s*-\s*Topic$/i,'').trim();
};
const spotifySongPart=track=>{
  const full=String(track?.title||'').trim(),parts=full.split(/\s+[–—-]\s+/);
  return parts.length>1?parts.slice(1).join(' – '):full;
};
const spotifyArtistNames=value=>String(value||'').split(/\s*(?:,|;|&|\+|\b(?:feat\.?|featuring|ft\.?|and|und)\b\.?|\s+[x×]\s+)\s*/iu).map(name=>name.trim()).filter(Boolean);
const spotifyCanonicalArtist=value=>String(value||'').toLocaleLowerCase('de-DE').normalize('NFKD').replace(/\p{M}/gu,'').replace(/[øØ]/g,'o').replace(/[łŁ]/g,'l').replace(/ß/g,'ss').replace(/[^\p{L}\p{N}]+/gu,'');
const spotifyArtistAliases=value=>{
  // A visible alias in "[Moe Phoenix]" is a second explicit artist credit.
  return spotifyArtistNames(String(value||'').replace(/[\[(]\s*([^\])]+?)\s*[\])]/gu,(_,alias)=>', '+alias))
    .map(spotifyCanonicalArtist).filter(Boolean);
};
const spotifyRequestedArtists=track=>spotifyArtistNames(spotifyArtistCredit(track)).map(spotifyCanonicalArtist).filter(Boolean);
const spotifyFeaturedArtists=value=>{
  const credits=[];
  for(const match of String(value||'').matchAll(/[\[(]\s*(?:feat(?:uring)?\.?|ft\.?)\s+([^\])]+?)\s*[\])]/giu))credits.push(...spotifyArtistAliases(match[1]));
  return [...new Set(credits)];
};
const spotifyCandidateArtistEvidence=candidate=>{
  const parts=spotifyCandidateTitleParts(candidate),byline=spotifyBylineCredit(candidate);
  const prefix=byline?.credit||parts.length>1?byline?.credit||parts[0].trim():'';
  const channel=String(candidate?.channel||candidate?.uploader||'').trim();
  const explicit=prefix||String(candidate?.artist||'').trim();
  const featured=spotifyFeaturedArtists(String(candidate?.title||''));
  const names=[...new Set([...spotifyArtistAliases(explicit),...featured])];
  if(!prefix&&channel)names.push(...spotifyArtistAliases(channel.replace(/\s*-\s*Topic$/iu,'')));
  return {names:new Set(names),prefix,topic:/\s*-\s*Topic$/iu.test(channel),channelArtist:spotifyCanonicalArtist(channel.replace(/\s*-\s*Topic$/iu,''))};
};
const spotifyArtistAliasMap=track=>{
  const names=spotifyRequestedArtists(track),aliases=new Map(names.map(name=>[name,new Set([name])]));
  const features=spotifyFeaturedArtists(spotifySongPart(track));
  // A single credited featured artist in a two-performer catalog track can
  // have a shorter stage name (e.g. Moe Phoenix = Moé), but never guess for
  // multiple ambiguous contributors.
  if(names.length===2&&features.length===1)aliases.get(names[1])?.add(features[0]);
  return aliases;
};
const spotifyNamedRemix=value=>{
  // A named remix must be an identifiable version suffix, not random title words.
  const title=String(value||'').trim().replace(/\s*[\[(]\s*(?:official\s+)?(?:audio|lyric(?:s)?(?:\s+video)?|music\s+video)\s*[\])]\s*$/iu,'').trim();
  const suffix=title.match(/(?:\s+[–—-]\s+|[\[(]\s*)([^()[\]]+?)\s+remix\s*[\])]?$/iu);
  if(!suffix)return null;
  const names=spotifyArtistNames(suffix[1]),credits=names.map(spotifyCanonicalArtist),base=title.slice(0,suffix.index).trim();
  if(!base||!names.length||names.length>6||credits.some(name=>!name)||new Set(credits).size!==credits.length)return null;
  return {base,names,credits:new Set(credits)};
};
const spotifyNamedEdit=value=>{
  const title=String(value||'').trim();
  const suffix=title.match(/(?:\s+[–—-]\s+|[\[(]\s*)([^()[\]]+?)\s+edit\s*[\])]?$/iu);
  if(!suffix)return null;
  const editor=spotifyCanonicalArtist(suffix[1]),base=title.slice(0,suffix.index).trim();
  return editor&&base?{base,editor}:null;
};
const spotifyCandidateSong=candidate=>{
  const byline=spotifyBylineCredit(candidate),parts=spotifyCandidateTitleParts(candidate);
  return byline?byline.song+(byline.trailing?' | '+byline.trailing:''):parts.length>1?parts.slice(1).join(' – '):parts[0]||'';
};
const spotifyPlainSong=value=>String(value||'')
  .replace(/\s*[\[(]\s*prod(?:uced)?\.?\s+by\s+[^\])]+[\])]\s*$/iu,'')
  .replace(/\s+prod(?:uced)?\.?\s+by\s+[\p{L}\p{N}_. -]+$/iu,'')
  .replace(/\s*[|｜]\s*(?:official\s+)?(?:audio|video|lyric(?:s)?(?:\s+video)?|music\s+video|visuali[sz]er)\s*$/iu,'')
  .replace(/\s*[\[(]\s*(?:official\s+)?(?:audio|video|lyric(?:s)?(?:\s+video)?|music\s+video|visuali[sz]er)\s*[\])]\s*$/iu,'')
  .replace(/\s*[\[(]\s*(?:feat(?:uring)?\.?|ft\.?)\s+[^\])]+\s*[\])]\s*$/iu,'')
  .trim();
const spotifyMaskedWordEquivalent=(expected,actual)=>{
  if(!['fuck','fick','fucking'].includes(expected)||!actual.includes('*')&&!actual.includes('#'))return false;
  if(!/^f[\p{L}*#]+$/u.test(actual))return false;
  const pattern='^'+[...actual].map(character=>character==='*'||character==='#'?'[a-z]':character).join('')+'$';
  if(new RegExp(pattern,'u').test(expected))return true;
  // An explicit, four-character mask cannot resolve which vowel was hidden;
  // it is accepted only for these two profane words with other song words
  // AND trustworthy artist evidence checked separately.
  return /^f[*#]{3}$/u.test(actual)&&['fuck','fick'].includes(expected);
};
const spotifySongWords=value=>new Set(String(value||'').toLocaleLowerCase('de-DE').normalize('NFKD')
  .replace(/\p{M}/gu,'').replace(/[øØ]/g,'o').replace(/ß/g,'ss')
  .match(/[\p{L}\p{N}*#]+/gu)?.filter(word=>word.length>1&&!['official','video','audio','lyrics','lyric','topic','musik','music'].includes(word))||[]);
const spotifySongCoverage=(expected,actual)=>{
  const wanted=[...expected],seen=[...actual],masked=[];
  let matches=0;
  for(const word of wanted){
    const index=seen.findIndex(value=>spotifyPlaybackWordEquivalent(word,value)||spotifyMaskedWordEquivalent(word,value));
    if(index>=0){if(spotifyMaskedWordEquivalent(word,seen[index]))masked.push(word);matches++;seen.splice(index,1)}
  }
  return {matches,masked,extra:seen};
};
const spotifyTitleFirstArtistCredit=(track,candidate)=>{
  // Official titles can put all credited artists AFTER the song in parentheses:
  // "Es eskaliert... (Eastsideboyz, ArniTheSavage, JSTN, Schillah)".
  // This is only artist evidence when EVERY Spotify artist is explicitly listed.
  const parts=spotifyCandidateTitleParts(candidate);
  if(parts.length!==1)return null; // A prefixed artist credit must not be bypassed.
  const match=parts[0].trim().match(/^(.+?)\s*[\[(]\s*([^\])]+?)\s*[\])]\s*$/u);
  if(!match||/\b(?:remix|mix|cover|live|version|edit|karaoke|instrumental)\b/i.test(match[2]))return null;
  const expected=spotifyArtistNames(spotifyArtistCredit(track)).map(spotifyCanonicalArtist);
  const listed=spotifyArtistNames(match[2]).map(spotifyCanonicalArtist);
  if(!expected.length||listed.length<expected.length||!expected.every(name=>listed.includes(name)))return null;
  const song=match[1].replace(/(?:\.{2,}|…)$/u,'').trim();
  return song?{song,credit:match[2]}:null;
};
export function spotifyPlaybackArtistCompatible(track,candidate){
  const expected=spotifyRequestedArtists(track);
  if(!expected.length)return true;
  if(spotifyTitleFirstArtistCredit(track,candidate))return true;
  const evidence=spotifyCandidateArtistEvidence(candidate),aliases=spotifyArtistAliasMap(track),primary=expected[0];
  const fusedPrefix=evidence.prefix&&spotifyArtistNames(evidence.prefix).length===1&&spotifyCanonicalArtist(evidence.prefix)===expected.join('');
  const known=name=>fusedPrefix||[...(aliases.get(name)||[])].some(alias=>evidence.names.has(alias));
  const matches=expected.map(known);
  if(!matches[0])return false;
  // An explicitly conflicting performer prefix must not be made credible by
  // a matching YouTube channel or a collaborator mentioned elsewhere.
  if(evidence.prefix&&!fusedPrefix){
    const prefixNames=spotifyArtistAliases(evidence.prefix);
    const allowed=[...aliases.values()].flatMap(aliases=>[...aliases]);
    if(prefixNames.some(name=>!allowed.includes(name)))return false;
  }
  const sourceSong=spotifySongPart(track),namedRemix=spotifyNamedRemix(sourceSong);
  if(namedRemix){
    // Named remixer identity is checked independently in the version suffix.
    return matches[0];
  }
  const offeredNamedRemix=spotifyNamedRemix(spotifyCandidateSong(candidate));
  if(/\bremix\b/i.test(sourceSong)&&offeredNamedRemix&&
    [...offeredNamedRemix.credits].every(name=>expected.includes(name))&&
    expected.every((name,index)=>matches[index]||offeredNamedRemix.credits.has(name)))return true;
  if(matches.every(Boolean))return true;
  // A real Topic channel establishes the primary performer for a title-only
  // upload; complete exact song, version and resolved source-duration checks
  // remain independent mandatory guards.
  const candidateSong=spotifyPlainSong(spotifyCandidateSong(candidate));
  const requestedSong=spotifyPlainSong(sourceSong);
  const genreMarkedArtistUpload=!evidence.topic&&expected.length>1&&!evidence.prefix&&
    !String(candidate?.artist||'').trim()&&evidence.channelArtist===primary&&
    /[\[(]\s*(?:uptempo|hardstyle|hardtekk|rawstyle|frenchcore|hardcore|techno|trance)\s*[\])]\s*$/iu.test(sourceSong)&&
    !/[\[(]\s*(?:feat(?:uring)?\.?|ft\.?)\b/iu.test(sourceSong);
  // A song on its primary artist's own channel can omit catalog collaborators,
  // but only accept a complete, distinct genre-marked title and known duration.
  if((evidence.topic&&evidence.channelArtist===primary&&!evidence.prefix||
    genreMarkedArtistUpload)&&
    !/[\[(]\s*(?:feat(?:uring)?\.?|ft\.?)\b/iu.test(candidateSong)){
    const wanted=spotifySongWords(requestedSong),seen=spotifySongWords(candidateSong);
    const coverage=spotifySongCoverage(wanted,seen);
    return wanted.size>0&&coverage.matches===wanted.size&&coverage.extra.length===0&&
      (!genreMarkedArtistUpload||Number(candidate?.duration)>0);
  }
  return false;
}
export function spotifyPlaybackMatchRejection(track,candidate){
  const song=spotifySongPart(track),embeddedCredit=spotifyTitleFirstArtistCredit(track,candidate);
  const rawCandidateSong=embeddedCredit?.song||spotifyCandidateSong(candidate);
  const requestedRemix=spotifyNamedRemix(song),requestedEdit=spotifyNamedEdit(song),candidateRemix=spotifyNamedRemix(rawCandidateSong),candidateEdit=spotifyNamedEdit(rawCandidateSong);
  const requestedPlain=spotifyPlainSong(song),candidatePlain=spotifyPlainSong(rawCandidateSong);
  // Version checks come before artist rejection so a missing remix can be
  // diagnosed accurately even when the video omits collaborator credits.
  const label=String(candidate?.title||'');
  const variants=/\b(?:remix|slowed|nightcore|cover|karaoke|instrumental|extended|reverb|sped\s*up)\b/giu;
  const expectedVariants=new Set([...requestedPlain.matchAll(variants)].map(match=>match[0].toLowerCase().replace(/\s+/g,' ')));
  const actualVariants=new Set([...label.matchAll(variants)].map(match=>match[0].toLowerCase().replace(/\s+/g,' ')));
  if([...actualVariants].some(value=>!expectedVariants.has(value))||
    [...expectedVariants].some(value=>!actualVariants.has(value))||
    /\b(?:super|ultra)\s+slowed\b/iu.test(label)&&!/\b(?:super|ultra)\s+slowed\b/iu.test(song)||
    /(?:[\[(]\s*live\s*[\])]|[–—-]\s+live\s*$)/iu.test(label)&&!/(?:[\[(]\s*live\s*[\])]|[–—-]\s+live\s*$)/iu.test(song))return 'version';
  if(requestedRemix&&(!candidateRemix||candidateRemix.credits.size!==requestedRemix.credits.size||
    [...requestedRemix.credits].some(name=>!candidateRemix.credits.has(name))||
    /\bremix\b/iu.test(candidateRemix.base)))return 'version';
  if(!requestedRemix&&/\bremix\b/iu.test(song)&&candidateRemix){
    const expected=spotifyRequestedArtists(track);
    if([...candidateRemix.credits].some(name=>!expected.includes(name)))return 'version';
  }
  if(requestedEdit&&(!candidateEdit||requestedEdit.editor!==candidateEdit.editor))return 'version';
  if(!requestedEdit&&candidateEdit)return 'version';
  if(/\bedit\b/iu.test(song)&&!/\bedit\b/iu.test(rawCandidateSong))return 'version';
  if(!/\bedit\b/iu.test(song)&&/\bedit\b/iu.test(rawCandidateSong))return 'version';
  if(!spotifyPlaybackArtistCompatible(track,candidate))return 'artist';
  const genericRemix=!requestedRemix&&/\bremix\b/iu.test(song);
  const removeGenericRemix=value=>String(value||'').replace(/(?:\s+[–—-]\s+remix|\s*[\[(]\s*remix\s*[\])])\s*$/iu,'').trim();
  const requestedBase=requestedRemix?.base||requestedEdit?.base||(genericRemix?removeGenericRemix(song):song);
  const candidateBase=requestedRemix?candidateRemix.base:requestedEdit?candidateEdit.base:
    genericRemix?(candidateRemix?.base||removeGenericRemix(rawCandidateSong)):rawCandidateSong;
  const wanted=spotifySongWords(spotifyPlainSong(requestedBase));
  const seen=spotifySongWords(spotifyPlainSong(candidateBase));
  const coverage=spotifySongCoverage(wanted,seen);
  if(wanted.size&&coverage.matches<Math.max(1,Math.ceil(wanted.size*0.8)))return 'title';
  if(wanted.size<=2&&coverage.extra.length)return 'title';
  if(embeddedCredit&&wanted.size<=3&&coverage.extra.length)return 'title';
  return null;
}
export function rankSpotifyPlaybackCandidates(track,candidates){const rejected=spotifyRejectedPlaybackIds(track),available=(Array.isArray(candidates)?candidates:[]).filter(candidate=>{const url=canonicalYouTubeVideoUrl(candidate?.id,candidate?.url),id=url?new URL(url).searchParams.get('v'):'';return url&&candidate?.title&&!rejected.has(String(id||''))&&!(track?.autoplayMode==='similar'&&musicSlowedVersion(candidate))});if(!available.length)return[];const wanted=matchingWords(track?.title),targetDuration=Math.max(0,Number(track?.catalogDuration??track?.duration)||0),variants=/(?:\b(?:live|remix|sped up|slowed|nightcore|cover|karaoke|instrumental|reverb|edit|version)\b)/i;return [...available].sort((left,right)=>{const score=candidate=>{const words=matchingWords(candidate.title),matched=spotifyWordCoverage(wanted,words),coverage=wanted.size?matched/wanted.size:0,duration=Math.max(0,Number(candidate.duration)||0),durationPenalty=targetDuration&&duration?Math.abs(duration-targetDuration)/targetDuration*100:25,variantPenalty=variants.test(candidate.title)&&!variants.test(track?.title||'')?45:0;return durationPenalty+(1-coverage)*80+variantPenalty};return score(left)-score(right)})}
export function selectSpotifyPlaybackCandidate(track,candidates){return rankSpotifyPlaybackCandidates(track,candidates)[0]||null;}
export const spotifyMatchSearchLimit=24;
export const spotifyMatchResolveLimit=12;
export const spotifyMatchSearchTimeMs=90_000;
const spotifyMatchReasonLabels=Object.freeze({artist:'falscher Künstler',version:'falsche Version',title:'abweichender Titel',duration:'unpassende Länge',source:'nicht erreichbare Quelle',search:'fehlgeschlagene YouTube-Suche'});
export class SpotifyMatchUnavailableError extends Error{
  constructor(item,diagnostics={}){
    const counts=Object.entries(spotifyMatchReasonLabels).filter(([key])=>diagnostics[key]>0).map(([key,label])=>label+': '+diagnostics[key]);
    const catalogSeconds=Math.max(0,Number(item?.catalogDuration??item?.duration)||0);
    const durationHint=catalogSeconds?' Katalogdauer: '+Math.round(catalogSeconds)+' s (Toleranz ±'+Math.round(spotifyPlaybackDurationToleranceSeconds(catalogSeconds))+' s).':'';
    const examples=(diagnostics.examples||[]).slice(0,4).join(' | ');
    super('Spotify-Titel „'+String(item?.title||'Unbekannt').slice(0,160)+'“ übersprungen: keine passende YouTube-Version gefunden. Diagnose: '+(counts.join(', ')||'keine geeigneten Suchtreffer')+(examples?'; Beispiele: '+examples:'')+'.'+durationHint);
    this.name='SpotifyMatchUnavailableError';this.code='SPOTIFY_MATCH_UNAVAILABLE';this.diagnostics=diagnostics;
  }
}
export const isSpotifyMatchUnavailableError=error=>error?.code==='SPOTIFY_MATCH_UNAVAILABLE';
export function spotifyPlaybackSearchQueries(item){
  const full=String(item?.title||'').trim().slice(0,180),song=spotifySongPart(item).slice(0,180),artist=spotifyArtistCredit(item).slice(0,140),artistNames=spotifyArtistNames(artist),primaryArtist=artistNames[0]||'';
  const remix=spotifyNamedRemix(song),edit=spotifyNamedEdit(song),baseSong=(remix?.base||edit?.base||song).trim();
  const finalWord=song.match(/([\p{L}]{6,}s)$/iu)?.[1]||'',alternateSong=finalWord?song.slice(0,-finalWord.length)+finalWord+'e':'';
  const multipleArtists=artistNames.length>1?artistNames.join(' '):'';
  // Prioritize the album/Topic audio recording, not longer official music
  // videos. Artist + exact song stay in EVERY query, even later fallbacks.
  // The search merely proposes candidates; artist, version and verified
  // source duration are independent mandatory checks before playback.
  const queries=[
    primaryArtist&&song?primaryArtist+' "'+song+'" official audio':'',
    primaryArtist&&song?primaryArtist+' "'+song+'" topic audio':'',
    remix&&primaryArtist?primaryArtist+' "'+remix.base+'" '+remix.names.join(' ')+' remix audio':'',
    edit&&primaryArtist?primaryArtist+' "'+edit.base+'" '+edit.editor+' edit audio':'',
    multipleArtists&&song?multipleArtists+' "'+song+'" audio':'',
    primaryArtist&&baseSong?primaryArtist+' "'+baseSong+'" provided to youtube audio':'',
    artist&&alternateSong?primaryArtist+' '+alternateSong+' audio':'',
    primaryArtist&&/[\p{L}]-[\p{L}]/u.test(baseSong)?primaryArtist+' "'+baseSong.replace(/([\p{L}])-([\p{L}])/gu,'$1 $2')+'" audio':'',
    artist&&song?'"'+song+'" "'+artist+'" audio':'',
    artist&&song?primaryArtist+' '+song+' topic':'',
    full?full+' audio':'',
    artist&&song?song+' '+artist:'',
    full
  ];
  return [...new Set(queries.map(value=>value.trim()).filter(Boolean))].slice(0,11);
}
export function spotifyOfficialMusicVideoFallbackCandidate(track,candidate){
  const catalog=Math.max(0,Number(track?.catalogDuration??track?.duration)||0),reported=Math.max(0,Number(candidate?.duration)||0);
  if(!catalog||!reported||catalog<90||reported-catalog<=spotifyPlaybackDurationToleranceSeconds(catalog)||
    reported-catalog>Math.min(60,catalog*0.25))return false;
  const title=String(candidate?.title||''),parts=spotifyCandidateTitleParts(candidate),requested=spotifyRequestedArtists(track);
  // A fallback cannot establish featured/collaborator identity from a lone
  // channel name. Only single-artist, explicitly official original videos.
  if(requested.length!==1||parts.length!==2||
    spotifyCanonicalArtist(parts[0])!==requested[0]||
    spotifyCanonicalArtist(String(candidate?.channel||'').replace(/\s*-\s*Topic$/iu,''))!==requested[0]||
    !/[\[(]\s*(?:official\s+)?(?:music\s+)?video\s*[\])]\s*$/iu.test(title)||
    /\b(?:remix|edit|slowed|extended|instrumental|karaoke|cover|reaction|live\s+(?:video|performance)|concert)\b/iu.test(title))return false;
  const wanted=spotifySongWords(spotifyPlainSong(spotifySongPart(track))),actual=spotifySongWords(spotifyPlainSong(parts[1]));
  const coverage=spotifySongCoverage(wanted,actual);
  return wanted.size>0&&coverage.matches===wanted.size&&coverage.extra.length===0&&
    spotifyPlaybackMatchRejection(track,candidate)===null;
}
export function spotifyPlaybackTitleCompatible(track,candidate){
  return spotifyPlaybackMatchRejection(track,candidate)===null;
}
export async function resolveSpotify(item,signal,{search=youtubeSearch,resolve=resolveYoutube}={}){
  const cacheKey=spotifyPlaybackCacheKey(item),catalogDuration=Math.max(0,Number(item.catalogDuration??item.duration)||0),cached=spotifyPlaybackCache.get(cacheKey),deadline=Date.now()+spotifyMatchSearchTimeMs;
  const diagnostics={artist:0,version:0,title:0,duration:0,source:0,search:0,examples:[]},exampleCandidates=[];
  const record=(reason,candidate)=>{
    diagnostics[reason]=(diagnostics[reason]||0)+1;
    if(candidate){
      const title=String(candidate.title||candidate.id||'unbekannt').replace(/\s+/g,' ').slice(0,88);
      const artist=String(candidate.channel||candidate.artist||'').replace(/\s+/g,' ').slice(0,48);
      const seconds=Math.max(0,Number(candidate.duration)||0);
      const relevance=spotifyWordCoverage(matchingWords(spotifySongPart(item)),matchingWords(title));
      const label=spotifyMatchReasonLabels[reason]+': '+title+(artist?' [Kanal/Künstler: '+artist+']':'')+(seconds?' ['+Math.round(seconds)+' s]':'');
      exampleCandidates.push({label,relevance});
      // Display the closest actual search results, not the first four random
      // search hits. The playback acceptance checks remain independent.
      exampleCandidates.sort((a,b)=>b.relevance-a.relevance);
      if(exampleCandidates.length>4)exampleCandidates.length=4;
    }
  };
  const resolveFailureReason=error=>/unpassende Länge|verifizierte Dauer/i.test(String(error?.message||''))?'duration':'source';
  const apply=(resolved,selected,{officialVideoFallback=false}={})=>{
    const realDuration=Math.max(0,Number(resolved?.duration)||0);
    if(officialVideoFallback){
      // An official video is not the catalog-length audio file. Verify that
      // the selected public video and freshly resolved stream have the SAME
      // video length and the requested original recording/title identity.
      if(!spotifyOfficialMusicVideoFallbackCandidate(item,selected)||
        !realDuration||Math.abs(realDuration-Number(selected.duration))>3||
        realDuration-catalogDuration<=spotifyPlaybackDurationToleranceSeconds(catalogDuration)||
        realDuration-catalogDuration>Math.min(60,catalogDuration*0.25))
        throw new Error('Musikvideo-Fallback hat eine unpassende Länge oder keine verifizierte Dauer.');
    }else if(catalogDuration&&(!realDuration||!spotifyPlaybackDurationCompatible(catalogDuration,realDuration))){
      throw new Error('YouTube-Treffer hat eine unpassende Länge oder keine verifizierte Dauer.');
    }
    const originalSpotifyTitle=String(item.title||'');
    applyResolvedPlayback(item,resolved);
    // The catalog identity remains unchanged in the dashboard, queue,
    // learning profile and Discord; YouTube identity stays source metadata.
    item.title=originalSpotifyTitle;
    const version=officialVideoFallback?'official-video-fallback':'audio';
    const match={id:resolved.id||selected.id,title:selected.title,artist:selected.artist||'',channel:selected.channel||'',duration:realDuration,catalogDuration,protocol:resolved.protocol||'',version};
    item.playbackVersion=version;
    item.playbackMatch=match;spotifyPlaybackCache.set(cacheKey,{...match,expires:Date.now()+12*60*60_000});
    while(spotifyPlaybackCache.size>500)spotifyPlaybackCache.delete(spotifyPlaybackCache.keys().next().value);
    return resolved.url;
  };
  const cachedFallback=cached?.version==='official-video-fallback';
  if(cached&&cached.expires>Date.now()&&rankSpotifyPlaybackCandidates(item,[cached]).length&&
    spotifyPlaybackTitleCompatible(item,cached)&&
    (!cachedFallback||spotifyOfficialMusicVideoFallbackCandidate(item,cached))){
    try{const resolved=await resolve(canonicalYouTubeVideoUrl(cached.id),signal,{deadline});return apply(resolved,cached,{officialVideoFallback:cachedFallback})}
    catch(error){spotifyPlaybackCache.delete(cacheKey);if(error.name==='AbortError'||isYouTubeAccessBlocked(error))throw error;record(resolveFailureReason(error),cached);if(!/unpassende Länge/i.test(error.message)&&!isPermanentYouTubeResolutionError(error))throw error}
  }
  const checked=new Set(),seen=new Set(),fallbackCandidates=[],queries=spotifyPlaybackSearchQueries(item);let resolvedCount=0,successfulSearches=0,searchFailure=null;
  for(const query of queries){
    if(Date.now()>=deadline||resolvedCount>=spotifyMatchResolveLimit)break;
    // Once audio searches had time, reserve enough budget to check an
    // already-found official video instead of timing out before resolving it.
    if(fallbackCandidates.length&&successfulSearches>=3&&Date.now()>=deadline-25_000)break;
    let candidates;
    try{candidates=await search(query,{limit:spotifyMatchSearchLimit,timeout:Math.min(20_000,Math.max(1000,deadline-Date.now())),signal})}
    catch(error){if(error.name==='AbortError'||isYouTubeAccessBlocked(error))throw error;searchFailure=error;record('search');continue}
    successfulSearches++;
    const newlyFound=[];
    for(const candidate of candidates){
      const url=canonicalYouTubeVideoUrl(candidate?.id,candidate?.url),id=url?new URL(url).searchParams.get('v'):'';
      if(!id){record('source',candidate);continue}
      if(seen.has(id))continue;
      seen.add(id);
      const reason=spotifyPlaybackMatchRejection(item,candidate);
      if(reason){record(reason,candidate);continue}
      newlyFound.push(candidate);
    }
    const ranked=rankSpotifyPlaybackCandidates(item,newlyFound);
    // Search metadata is a hint; verify promising durations before spending time on obvious mismatches.
    const shortlist=ranked.filter(candidate=>{
      if(spotifyPlaybackDurationCompatible(catalogDuration,candidate.duration))return true;
      if(spotifyOfficialMusicVideoFallbackCandidate(item,candidate))fallbackCandidates.push(candidate);
      else record('duration',candidate);
      return false;
    });
    for(const selected of shortlist){
      if(resolvedCount>=spotifyMatchResolveLimit||Date.now()>=deadline)break;
      const url=canonicalYouTubeVideoUrl(selected.id,selected.url);
      if(!url||checked.has(selected.id))continue;
      checked.add(selected.id);resolvedCount++;
      try{const resolved=await resolve(url,signal,{deadline});return apply(resolved,selected)}
      catch(error){if(error.name==='AbortError'||isYouTubeAccessBlocked(error))throw error;searchFailure=error;record(resolveFailureReason(error),selected)}
    }
  }
  // Consider the longer original video only after all viable audio releases.
  for(const selected of fallbackCandidates.sort((left,right)=>Number(left.duration)-Number(right.duration))){
    if(Date.now()>=deadline||resolvedCount>=spotifyMatchResolveLimit)break;
    const url=canonicalYouTubeVideoUrl(selected.id,selected.url);
    if(!url||checked.has(selected.id))continue;
    checked.add(selected.id);resolvedCount++;
    try{
      const resolved=await resolve(url,signal,{deadline});
      return apply(resolved,selected,{officialVideoFallback:true});
    }catch(error){
      if(error.name==='AbortError'||isYouTubeAccessBlocked(error))throw error;
      searchFailure=error;record(resolveFailureReason(error),selected);
    }
  }
  // Search may return no matches at all; do not turn an unavailable version into a player failure.
  if(searchFailure&&!successfulSearches)throw searchFailure;
  diagnostics.examples=exampleCandidates.map(example=>example.label);
  throw new SpotifyMatchUnavailableError(item,diagnostics);
}
export async function resolveInput(item,musicDir,{signal}={}){if(signal?.aborted){const error=new Error('Medienauflösung abgebrochen');error.name='AbortError';throw error;}if(item.source==='local')return safeMusicRelativePath(musicDir,item.path);if(item.source==='youtube'){const url=canonicalYouTubeVideoUrl(item.id,item.url);if(!url)throw new Error('Der gespeicherte YouTube-Titel enthält keine gültige Video-ID.');const resolved=await resolveYoutube(url,signal);applyResolvedPlayback(item,resolved);return resolved.url}if(item.source==='spotify')return resolveSpotify(item,signal);const url=normalizeRadioUrl(item.url);await assertSafeExternalUrl(url);return url;}
