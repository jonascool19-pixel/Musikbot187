import {spawn} from 'node:child_process';
import path from 'node:path';
import {musicArtist} from '../music-identity.js';
import {assertSafeExternalUrl} from '../security.js';
import {classifyYouTubeAudioFailure,isYouTubeAccessBlocked,sharedYouTubeAccess} from '../youtube-access.js';

export const youtubeRuntimeArgs=Object.freeze([
  '--ignore-config','--socket-timeout','8','--extractor-retries','1',
  '--js-runtimes','node','--remote-components','ejs:github',
  '--sleep-requests','0.25'
]);
export const youtubeSearchStrategies=Object.freeze([
  Object.freeze(['--extractor-args','youtubetab:skip=webpage']),
  Object.freeze([])
]);
export const youtubePotProviderArgs='youtubepot-bgutilscript:server_home=/opt/musikbot187-bgutil/server';
export const youtubeClientStrategies=Object.freeze([
  Object.freeze(['--extractor-args','youtube:player_client=mweb','--extractor-args',youtubePotProviderArgs]),
  Object.freeze(['--extractor-args','youtube:player_client=web_safari']),
  Object.freeze(['--extractor-args','youtube:player_client=web_embedded'])
]);
export const searchResultLimit=50;
export const bestAudioFormat='bestaudio[protocol=https]/bestaudio[protocol=http]/bestaudio/best';
export const youtubeAudioFormatForClient=client=>client==='web_safari'
  ?`bestaudio[protocol=m3u8_native]/bestaudio[protocol=m3u8]/${bestAudioFormat}`
  :bestAudioFormat;
export const youtubePlaybackPrintTemplate='%(url)s\t%(duration)s\t%(protocol)s\t%(id)s\t%(http_headers)j\t%(title)j\t%(artist)j\t%(artists)j\t%(channel)j';

const videoIdPattern=/^[A-Za-z0-9_-]{11}$/;
const resolveTimeoutMs=12_000;
const attemptTimeoutMs=8_000;
const searchAttemptTimeoutMs=12_000;
const playbackValidationTimeoutMs=4_000;
export const youtubeSearchRetryAfterMs=30_000;

export class YouTubeSearchTemporarilyUnavailableError extends Error{
  constructor(detail=''){
    super(`YouTube-Suche antwortet derzeit zu langsam. Der aktuelle Titel und die Warteschlange bleiben erhalten; neuer Versuch in ${Math.ceil(youtubeSearchRetryAfterMs/1000)} Sekunden.${detail?` ${detail}`:''}`);
    this.name='YouTubeSearchTemporarilyUnavailableError';
    this.code='YOUTUBE_SEARCH_TEMPORARILY_UNAVAILABLE';
    this.retryAfterMs=youtubeSearchRetryAfterMs;
  }
}
export const isYouTubeSearchTemporarilyUnavailable=error=>error?.code==='YOUTUBE_SEARCH_TEMPORARILY_UNAVAILABLE';

export function youtubeAuthenticationArgs(){
  const cookies=String(process.env.YOUTUBE_COOKIES_FILE||'').trim();
  const userAgent=String(process.env.YOUTUBE_USER_AGENT||'').trim();
  const args=[];
  if(cookies&&(path.isAbsolute(cookies)||path.win32.isAbsolute(cookies)))args.push('--cookies',cookies);
  if(userAgent.length>=20&&userAgent.length<=512)args.push('--user-agent',userAgent);
  return args;
}

export function runMediaProcess(command,args,{timeout=20_000,max=1024*1024,signal}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output=Buffer.alloc(0),errors='',settled=false,timedOut=false;
    const finish=(callback,value)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      signal?.removeEventListener('abort',abort);
      callback(value);
    };
    const abort=()=>{
      child.kill('SIGKILL');
      const error=new Error('Medienauflösung abgebrochen');
      error.name='AbortError';
      finish(reject,error);
    };
    const timer=setTimeout(()=>{
      timedOut=true;
      child.kill('SIGKILL');
    },timeout);
    if(signal?.aborted)return abort();
    signal?.addEventListener('abort',abort,{once:true});
    child.stdout.on('data',chunk=>{
      output=Buffer.concat([output,chunk]);
      if(output.length>max){errors='Antwort der Medienauflösung ist zu groß';child.kill('SIGKILL');}
    });
    child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-4096);});
    child.on('error',error=>finish(reject,error));
    child.on('close',code=>{
      if(code===0)return finish(resolve,output.toString());
      finish(reject,new Error(timedOut?`${command} Zeitüberschreitung`:errors||`${command} exit ${code}`));
    });
  });
}

export function runMediaCommand(command,args,options={}){
  if(command!=='yt-dlp')return runMediaProcess(command,args,options);
  return sharedYouTubeAccess.run(
    ()=>runMediaProcess(command,args,options),
    {signal:options.signal,recoverOnSuccess:!args.includes('--flat-playlist')}
  );
}

export function youtubeSearchUrl(query,provider='youtube'){
  const value=String(query||'').trim().slice(0,300);
  if(!value)throw new Error('YouTube-Suchbegriff fehlt.');
  return provider==='youtube-music'?`https://music.youtube.com/search?q=${encodeURIComponent(value)}#songs`:`https://www.youtube.com/results?search_query=${encodeURIComponent(value)}`;
}

export function youtubeSearchInput(query,provider='youtube',limit=searchResultLimit){
  const value=String(query||'').trim().slice(0,300);
  if(!value)throw new Error('YouTube-Suchbegriff fehlt.');
  const bounded=Math.max(1,Math.min(searchResultLimit,Number(limit)||searchResultLimit));
  return provider==='youtube-music'?youtubeSearchUrl(value,provider):`ytsearch${bounded}:${value}`;
}

export function canonicalYouTubeVideoUrl(id,raw=''){
  const direct=String(id||'').replace(/^yt:/i,'');
  if(videoIdPattern.test(direct))return `https://www.youtube.com/watch?v=${direct}`;
  try{
    const url=new URL(String(raw||''));
    const host=url.hostname.toLowerCase();
    const candidate=host==='youtu.be'
      ?url.pathname.split('/').filter(Boolean)[0]
      :['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host)
        ?url.pathname==='/watch'
          ?url.searchParams.get('v')
          :url.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})(?:\/|$)/)?.[1]
        :'';
    return videoIdPattern.test(String(candidate||''))?`https://www.youtube.com/watch?v=${candidate}`:'';
  }catch{return ''}
}

export const youtubeSearchArtist=entry=>musicArtist(entry);

async function youtubeSearchData(query,limit,timeout,signal,provider){
  const deadline=Date.now()+Math.max(1_000,Number(timeout)||30_000);
  const failures=[];
  for(const strategy of youtubeSearchStrategies){
    const remaining=deadline-Date.now();
    if(remaining<=0)break;
    try{
      const raw=await runMediaCommand('yt-dlp',[
        ...youtubeRuntimeArgs,...youtubeAuthenticationArgs(),
        '--dump-single-json','--flat-playlist','--playlist-end',String(limit),
        '--force-ipv4',...strategy,youtubeSearchInput(query,provider,limit)
      ],{timeout:Math.min(searchAttemptTimeoutMs,remaining),signal});
      return JSON.parse(raw);
    }catch(error){
      if(error.name==='AbortError'||isYouTubeAccessBlocked(error))throw error;
      failures.push(error.message);
    }
  }
  const detail=failures.at(-1)||'Zeitüberschreitung';
  if(failures.some(value=>/zeitüberschreitung|timed?\s*out|timeout/i.test(value)))throw new YouTubeSearchTemporarilyUnavailableError(detail);
  throw new Error(`YouTube-Suche konnte nicht abgeschlossen werden. ${detail}`);
}

export async function youtubeSearch(query,{limit=searchResultLimit,timeout=30_000,signal,provider='youtube'}={}){
  limit=Math.max(1,Math.min(searchResultLimit,Number(limit)||searchResultLimit));
  const json=await youtubeSearchData(query,limit,timeout,signal,provider);
  return normalizeYouTubeEntries(json,limit,provider);
}

export async function youtubeMusicRadio(id,{limit=40,timeout=12_000,signal}={}){
  if(!videoIdPattern.test(String(id||'')))return [];
  limit=Math.max(1,Math.min(50,Number(limit)||40));
  const raw=await runMediaCommand('yt-dlp',[...youtubeRuntimeArgs,...youtubeAuthenticationArgs(),'--dump-single-json','--flat-playlist','--playlist-end',String(limit),'--force-ipv4',`https://music.youtube.com/watch?v=${id}&list=RD${id}`],{timeout,signal,max:2*1024*1024});
  return normalizeYouTubeEntries(JSON.parse(raw),limit,'youtube-music-radio');
}

export function normalizeYouTubeEntries(json,limit=50,provider='youtube'){
  return (json.entries||[]).map(entry=>{
    const url=canonicalYouTubeVideoUrl(entry.id,entry.url);
    if(!url)return null;
    return {
      id:new URL(url).searchParams.get('v'),
      title:entry.title,
      artist:youtubeSearchArtist(entry),
      artists:entry.artists||[],trackTitle:entry.track||'',album:entry.album||'',isrc:entry.isrc||'',provider,
      channel:String(entry.channel||entry.uploader||''),
      url,
      source:'youtube',
      duration:entry.duration,
      thumbnail:entry.thumbnail,
      quality:'Beste verfügbare Audioqualität'
    };
  }).filter(Boolean).slice(0,limit);
}

export function sanitizeResolvedYouTubeHeaders(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
  const headers={};
  for(const [name,value] of Object.entries(raw)){
    const text=String(value??'');
    if(Object.keys(headers).length>=32||
      !/^[A-Za-z0-9-]{1,64}$/.test(name)||!text||text.length>4096||
      /[\r\n\0]/.test(text)||/^(?:host|content-length|transfer-encoding|connection|range)$/i.test(name))continue;
    headers[name]=text;
  }
  return headers;
}

export function youtubePlaybackValidationArgs(resolved){
  const headers=Object.entries(sanitizeResolvedYouTubeHeaders(resolved?.headers));
  const userAgent=headers.find(([name])=>/^user-agent$/i.test(name))?.[1];
  const forwarded=headers
    .filter(([name])=>!/^user-agent$/i.test(name))
    .map(([name,value])=>`${name}: ${value}\r\n`)
    .join('');
  const args=[
    '-nostdin','-hide_banner','-loglevel','error',
    '-rw_timeout',String(playbackValidationTimeoutMs*1_000)
  ];
  if(userAgent)args.push('-user_agent',String(userAgent));
  if(forwarded)args.push('-headers',forwarded);
  args.push('-i',String(resolved?.url||''),'-map','0:a:0','-frames:a','1','-f','null','-');
  return args;
}

export async function validateResolvedYouTubeAudio(resolved,signal,{run=runMediaProcess,deadline=Infinity}={}){
  const timeout=Math.min(playbackValidationTimeoutMs,deadline-Date.now());
  if(timeout<=0)throw new Error('Zeitbudget für die YouTube-Audioprüfung erschöpft.');
  try{
    await run('ffmpeg',youtubePlaybackValidationArgs(resolved),{
      signal,
      timeout,
      max:64*1024
    });
    return resolved;
  }catch(error){
    if(error?.name==='AbortError')throw error;
    const blocked=/(?:http error 403|server returned 403|403 forbidden)/i.test(String(error?.message||error||''));
    throw new Error(blocked
      ?'Die aufgelöste YouTube-Medienadresse verweigert den Audiozugriff (HTTP 403).'
      :'Die aufgelöste YouTube-Medienadresse liefert kein abspielbares Audio.');
  }
}

export function parseResolvedYouTubeOutput(raw){
  const line=String(raw||'').split(/\r?\n/).find(value=>value.trim());
  if(!line)throw new Error('yt-dlp hat keine Audioadresse geliefert.');
  const [url='',durationRaw='',protocol='',id='',headersRaw='',titleRaw='',artistRaw='',artistsRaw='',channelRaw='']=line.split('\t');
  if(!/^https?:\/\//i.test(url))throw new Error('yt-dlp hat keine gültige Audioadresse geliefert.');
  const parsedDuration=Number(durationRaw);
  let headers={};
  if(headersRaw)try{headers=sanitizeResolvedYouTubeHeaders(JSON.parse(headersRaw));}catch{}
  const metadata=value=>{try{return JSON.parse(value)}catch{return null}};
  const text=value=>typeof value==='string'?value.slice(0,500):'';
  const title=text(metadata(titleRaw)),artist=text(metadata(artistRaw)),channel=text(metadata(channelRaw));
  const credits=metadata(artistsRaw);
  const artists=Array.isArray(credits)?credits.slice(0,20).map(text).filter(Boolean):[];
  return {
    ...(title?{title}:{}),
    ...(artist?{artist}:{}),
    ...(artists.length?{artists}:{}),
    ...(channel?{channel}:{}),
    url:url.trim(),
    duration:Number.isFinite(parsedDuration)&&parsedDuration>0?parsedDuration:0,
    protocol:String(protocol||'').trim(),
    id:String(id||'').trim(),
    headers
  };
}

export function applyResolvedPlayback(item,resolved){
  if(!item||!resolved)return;
  const original=Math.max(0,Number(item.catalogDuration??item.duration)||0);
  if(item.catalogDuration==null&&original>0)item.catalogDuration=original;
  const duration=Math.max(0,Number(resolved.duration)||0);
  item.playbackDuration=duration;
  item.playbackProtocol=String(resolved.protocol||'');
  item.playbackVideoId=String(resolved.id||'');
  item.duration=duration;
  Object.defineProperty(item,'playbackHeaders',{value:sanitizeResolvedYouTubeHeaders(resolved.headers),writable:true,configurable:true,enumerable:false});
  Object.defineProperty(item,'_youtubePlaybackClient',{value:String(resolved.client||'mweb'),writable:true,configurable:true,enumerable:false});
}

export function isPermanentYouTubeResolutionError(error){
  return error?.code==='YOUTUBE_AGE_RESTRICTED'||
    /(?:video unavailable|not made this video available|not available in your country|private video|members[- ]only|age[- ]restricted|copyright|blocked due to|no longer available)/i.test(String(error?.message||error||''));
}

const strategyClient=strategy=>String(strategy?.find(value=>String(value).startsWith('youtube:player_client='))||'').split('=').at(-1)||'web_embedded';
export const youtubeResolutionStrategies=preferredClient=>{
  const start=youtubeClientStrategies.findIndex(strategy=>strategyClient(strategy)===preferredClient);
  return start>=0?[youtubeClientStrategies[start]]:[youtubeClientStrategies[0]];
};

export const youtubePipeProtocol='yt-dlp-pipe';

export function youtubePlaybackPipeArgs(url){
  return [...youtubeRuntimeArgs,...youtubeAuthenticationArgs(),
    '--no-playlist','--no-progress','-f','bestaudio','-o','-',url];
}

export async function resolveYouTubePipe(query,signal,{deadline=Date.now()+resolveTimeoutMs}={}){
  const url=canonicalYouTubeVideoUrl('',query);
  const timeout=deadline-Date.now();
  if(!url||timeout<=0)throw new Error('Keine Zeit für die YouTube-Ersatzquelle.');
  const output=await runMediaCommand('yt-dlp',[
    ...youtubeRuntimeArgs,...youtubeAuthenticationArgs(),
    '--no-playlist','--print',youtubePlaybackPrintTemplate,'-f','bestaudio',url
  ],{signal,timeout});
  const metadata=parseResolvedYouTubeOutput(output);
  return {...metadata,url,protocol:youtubePipeProtocol,client:'yt-dlp-pipe',headers:{}};
}

export async function resolveYouTubeAudio(query,signal,{deadline=Date.now()+resolveTimeoutMs,preferredClient='',allowPipe=false,validate=validateResolvedYouTubeAudio}={}){
  const failures=[];
  let classifiedFailure=null;
  // One resolver call represents one client attempt. The player owns the
  // bounded client fallback sequence, so a failed Safari attempt cannot hide
  // another 20-second embedded attempt inside the same retry.
  const strategies=youtubeResolutionStrategies(preferredClient);
  for(const strategy of strategies){
    const remaining=deadline-Date.now();
    if(remaining<=0)break;
    try{
      const output=await runMediaCommand('yt-dlp',[
        ...youtubeRuntimeArgs,...youtubeAuthenticationArgs(),
        '--no-playlist','--print',youtubePlaybackPrintTemplate,
        '-f',youtubeAudioFormatForClient(strategyClient(strategy)),'--force-ipv4',...strategy,query
      ],{signal,timeout:Math.min(attemptTimeoutMs,remaining)});
      const resolved=parseResolvedYouTubeOutput(output);
      await assertSafeExternalUrl(resolved.url);
      const selected={...resolved,client:strategyClient(strategy)};
      try{
        await validate(selected,signal,{deadline});
      }catch(error){
        if(!allowPipe||!/HTTP 403/i.test(error.message))throw error;
        const page=canonicalYouTubeVideoUrl(selected.id,query);
        if(!page)throw error;
        return {...selected,url:page,protocol:youtubePipeProtocol,client:youtubePipeProtocol,headers:{}};
      }
      return selected;
    }catch(error){
      if(error.name==='AbortError'||isYouTubeAccessBlocked(error))throw error;
      const outage=classifyYouTubeAudioFailure(error?.message);
      if(outage)classifiedFailure=outage;
      failures.push(outage?.code==='YOUTUBE_AGE_RESTRICTED'?outage.message:error.message);
      if(outage?.code==='YOUTUBE_AGE_RESTRICTED'||isPermanentYouTubeResolutionError(error))break;
    }
  }
  if(classifiedFailure)throw classifiedFailure;
  throw new Error(`YouTube-Audio konnte mit keiner Clientvariante aufgelöst werden. ${failures.at(-1)||''}`.trim());
}
