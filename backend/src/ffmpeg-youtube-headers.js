import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';

export const youtubeFfmpegUserAgent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
export const youtubeFfmpegHeaders='Referer: https://www.youtube.com/\r\nOrigin: https://www.youtube.com\r\n';
export const youtubePotProviderHome='/opt/musikbot187-bgutil/server';
export const youtubePotProviderArgs=`youtubepot-bgutilscript:server_home=${youtubePotProviderHome}`;
export const youtubePlaybackHeaderTemplate='%(http_headers)j';
export const youtubePlaybackStrategies=Object.freeze([
  Object.freeze({client:'mweb',format:'bestaudio[protocol=https]/bestaudio[protocol^=m3u8]/bestaudio[protocol=http]/bestaudio/best'}),
  Object.freeze({client:'web_safari',format:'bestaudio[protocol^=m3u8]/bestaudio[protocol=https]/bestaudio[protocol=http]/bestaudio/best'}),
  Object.freeze({client:'web_embedded',format:'bestaudio[protocol=https]/bestaudio[protocol^=m3u8]/bestaudio[protocol=http]/bestaudio/best'}),
  Object.freeze({client:'tv',format:'bestaudio[protocol=https]/bestaudio[protocol^=m3u8]/bestaudio[protocol=http]/bestaudio/best'})
]);
export const youtubePlaybackClient=youtubePlaybackStrategies[0].client;
export const youtubePlaybackFormat=youtubePlaybackStrategies[0].format;
const failoverTtlMs=10*60_000,maxResolutionMetadata=256,playbackFailover=new Map(),resolutionMetadata=new Map();

export function isYouTubeMediaUrl(value){
  try{
    const url=new URL(String(value||''));
    const host=url.hostname.toLowerCase();
    return url.protocol==='https:'&&(host==='youtube.com'||host.endsWith('.youtube.com')||host==='googlevideo.com'||host.endsWith('.googlevideo.com'));
  }catch{return false}
}

export function youtubeSourceKey(args=[]){
  if(!Array.isArray(args))return '';
  for(let index=args.length-1;index>=0;index--){
    const value=String(args[index]||'');
    try{
      const url=new URL(value),host=url.hostname.toLowerCase();
      if(url.protocol==='https:'&&(host==='youtu.be'||host==='youtube.com'||host.endsWith('.youtube.com')))return url.toString();
    }catch{}
  }
  return '';
}

export function resetYouTubePlaybackFailover(sourceKey=''){
  if(sourceKey)playbackFailover.delete(String(sourceKey));
  else playbackFailover.clear();
}

export function markYouTubePlayback403(sourceKey,strategyIndex=0,now=Date.now()){
  const key=String(sourceKey||'');if(!key)return;
  playbackFailover.set(key,{index:(Math.max(0,Number(strategyIndex)||0)+1)%youtubePlaybackStrategies.length,updatedAt:now});
}

export function youtubePlaybackStrategy(sourceKey='',now=Date.now()){
  const key=String(sourceKey||''),saved=playbackFailover.get(key);
  if(saved&&now-saved.updatedAt<=failoverTtlMs)return {index:saved.index,...youtubePlaybackStrategies[saved.index]};
  if(saved)playbackFailover.delete(key);
  return {index:0,...youtubePlaybackStrategies[0]};
}

function extractorArgValues(args=[]){return args.flatMap((value,index)=>value==='--extractor-args'?[String(args[index+1]||'')]:[])}
function configuredYouTubeClient(args=[]){
  for(const value of extractorArgValues(args)){
    const match=value.match(/(?:^|[;,])youtube:player_client=([^;,]+)/i);if(match)return match[1].trim();
  }
  return '';
}
function formatForClient(client,fallback=youtubePlaybackFormat){return youtubePlaybackStrategies.find(strategy=>strategy.client===client)?.format||fallback}

export function isYouTubePlaybackResolutionArgs(args=[]){
  if(!Array.isArray(args))return false;
  if(args.includes('--get-url'))return true;
  return args.some((value,index)=>{
    const option=String(value||'');
    if(option.startsWith('--print='))return option.slice('--print='.length).includes('%(url)s');
    if(option!=='--print'&&option!=='-O')return false;
    return String(args[index+1]||'').includes('%(url)s');
  });
}

export function isYouTubePlaybackStreamingArgs(args=[]){
  if(!Array.isArray(args)||!youtubeSourceKey(args))return false;
  return args.some((value,index)=>{
    const option=String(value||'');
    if(option==='-o'||option==='--output')return String(args[index+1]||'')==='-';
    if(option.startsWith('--output='))return option.slice('--output='.length)==='-';
    return false;
  });
}

export function isYouTubePlaybackArgs(args=[]){
  return isYouTubePlaybackResolutionArgs(args)||isYouTubePlaybackStreamingArgs(args);
}

export function withYouTubeResolutionHeaders(args=[]){
  if(!isYouTubePlaybackResolutionArgs(args))return args;
  const patched=[...args];
  for(let index=0;index<patched.length;index++){
    const option=String(patched[index]||'');
    if(option.startsWith('--print=')){
      const template=option.slice('--print='.length);
      if(template.includes('%(url)s')&&!template.includes('%(http_headers)'))patched[index]=`--print=${template}\t${youtubePlaybackHeaderTemplate}`;
      continue;
    }
    if((option==='--print'||option==='-O')&&String(patched[index+1]||'').includes('%(url)s')&&!String(patched[index+1]||'').includes('%(http_headers)'))patched[index+1]=`${patched[index+1]}\t${youtubePlaybackHeaderTemplate}`;
  }
  return patched;
}

export function withYouTubePlaybackClient(args=[],now=Date.now()){
  if(!isYouTubePlaybackArgs(args))return args;
  let patched=withYouTubeResolutionHeaders([...args]),client=configuredYouTubeClient(patched),strategyIndex=-1;
  if(!client){const strategy=youtubePlaybackStrategy(youtubeSourceKey(patched),now);client=strategy.client;strategyIndex=strategy.index;patched.unshift('--extractor-args',`youtube:player_client=${client}`)}
  else strategyIndex=Math.max(0,youtubePlaybackStrategies.findIndex(strategy=>strategy.client===client));
  const usesMweb=/(?:^|,)mweb(?:$|,)/i.test(client),hasPotProvider=extractorArgValues(patched).some(value=>value.includes('youtubepot-bgutil'));
  if(usesMweb&&!hasPotProvider)patched.unshift('--extractor-args',youtubePotProviderArgs);
  const formatIndex=patched.indexOf('-f');
  if(formatIndex>=0&&formatIndex+1<patched.length)patched[formatIndex+1]=formatForClient(client,patched[formatIndex+1]);
  Object.defineProperty(patched,'youtubePlaybackContext',{value:{sourceKey:youtubeSourceKey(patched),client,strategyIndex},enumerable:false});
  return patched;
}

export function sanitizeYouTubeHttpHeaders(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
  const out={};let count=0;
  for(const [name,value] of Object.entries(raw)){
    if(count>=32||!/^[A-Za-z0-9-]{1,64}$/.test(name))continue;
    const text=String(value??'');if(!text||text.length>4096||/[\r\n\0]/.test(text))continue;
    if(/^(?:host|content-length|transfer-encoding|connection|range)$/i.test(name))continue;
    out[name]=text;count++;
  }
  return out;
}

export function parseYouTubeResolutionMetadata(raw,context={}){
  const line=String(raw||'').split(/\r?\n/).find(value=>/^https?:\/\//i.test(value.trim()));if(!line)return null;
  const fields=line.split('\t'),url=fields[0]?.trim();if(!isYouTubeMediaUrl(url))return null;
  let headers={};
  if(fields[4])try{headers=sanitizeYouTubeHttpHeaders(JSON.parse(fields[4]))}catch{}
  return {url,headers,sourceKey:String(context.sourceKey||''),client:String(context.client||''),strategyIndex:Math.max(0,Number(context.strategyIndex)||0),recordedAt:Date.now()};
}

function rememberResolution(metadata){
  if(!metadata?.url)return;resolutionMetadata.set(metadata.url,metadata);
  while(resolutionMetadata.size>maxResolutionMetadata)resolutionMetadata.delete(resolutionMetadata.keys().next().value);
}

export function withYouTubeFfmpegHeaders(args=[],headers=null){
  if(!Array.isArray(args))return args;
  const inputIndex=args.indexOf('-i'),input=inputIndex>=0?args[inputIndex+1]:'';
  if(inputIndex<0||!isYouTubeMediaUrl(input))return args;
  const exact=sanitizeYouTubeHttpHeaders(headers||resolutionMetadata.get(String(input))?.headers),hasExact=Object.keys(exact).length>0,before=args.slice(0,inputIndex),after=args.slice(inputIndex);
  const userAgent=Object.entries(exact).find(([name])=>/^user-agent$/i.test(name))?.[1]||youtubeFfmpegUserAgent;
  const headerLines=Object.entries(exact).filter(([name])=>!/^user-agent$/i.test(name)).map(([name,value])=>`${name}: ${value}\r\n`).join('');
  if(!before.includes('-user_agent'))before.push('-user_agent',userAgent);
  if(!before.includes('-headers')&&(headerLines||!hasExact))before.push('-headers',headerLines||youtubeFfmpegHeaders);
  return [...before,...after];
}

function observeYtDlpResolution(child,context){
  if(!child?.stdout||!context)return;let captured='',done=false;
  const save=()=>{if(done)return;const metadata=parseYouTubeResolutionMetadata(captured,context);if(!metadata)return;done=true;rememberResolution(metadata);child.stdout.off?.('data',onData)};
  const onData=chunk=>{if(captured.length<=32*1024)captured+=chunk.toString();if(/[\r\n]/.test(captured))save()};
  child.stdout.on('data',onData);
  child.once('close',save);
}

function observeYtDlpStreaming(child,context){
  if(!child?.stderr||!context?.sourceKey)return;let errors='';
  child.stderr.on('data',chunk=>{errors=(errors+chunk.toString()).slice(-8192)});
  child.once('close',code=>{
    if(Number(code)!==0&&/(?:http error 403|server returned 403|403 forbidden)/i.test(errors))markYouTubePlayback403(context.sourceKey,context.strategyIndex);
    else if(Number(code)===0)resetYouTubePlaybackFailover(context.sourceKey);
  });
}

function observeFfmpeg403(child,input,metadata){
  if(!child?.stderr||!metadata?.sourceKey)return;let errors='';
  child.stderr.on('data',chunk=>{errors=(errors+chunk.toString()).slice(-8192)});
  child.once('close',code=>{
    resolutionMetadata.delete(String(input));
    if(Number(code)!==0&&/(?:http error 403|server returned 403|403 forbidden)/i.test(errors))markYouTubePlayback403(metadata.sourceKey,metadata.strategyIndex);
    else if(Number(code)===0)resetYouTubePlaybackFailover(metadata.sourceKey);
  });
}

const originalSpawn=childProcess.spawn;
if(!childProcess.__musikbot187YoutubeHeadersInstalled){
  Object.defineProperty(childProcess,'__musikbot187YoutubeHeadersInstalled',{value:true,configurable:false,enumerable:false,writable:false});
  childProcess.spawn=function(command,args,options){
    const executable=String(command||'').split(/[\\/]/).at(-1)?.toLowerCase();
    if(executable==='yt-dlp'){
      const patched=withYouTubePlaybackClient(args),context=patched?.youtubePlaybackContext,child=originalSpawn.call(this,command,patched,options);
      if(isYouTubePlaybackResolutionArgs(args))observeYtDlpResolution(child,context);
      if(isYouTubePlaybackStreamingArgs(args))observeYtDlpStreaming(child,context);
      return child;
    }
    if(executable==='ffmpeg'){
      const inputIndex=Array.isArray(args)?args.indexOf('-i'):-1,input=inputIndex>=0?String(args[inputIndex+1]||''):'',metadata=resolutionMetadata.get(input),patched=withYouTubeFfmpegHeaders(args,metadata?.headers),child=originalSpawn.call(this,command,patched,options);
      if(metadata)observeFfmpeg403(child,input,metadata);
      return child;
    }
    return originalSpawn.call(this,command,args,options);
  };
  syncBuiltinESMExports();
}
