import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';

export const youtubeFfmpegUserAgent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
export const youtubeFfmpegHeaders='Referer: https://www.youtube.com/\r\nOrigin: https://www.youtube.com\r\n';
export const youtubePlaybackClient='mweb';
export const youtubePotProviderHome='/opt/musikbot187-bgutil/server';
export const youtubePotProviderArgs=`youtubepot-bgutilscript:server_home=${youtubePotProviderHome}`;
export const youtubePlaybackFormat='bestaudio[protocol=https]/bestaudio[protocol^=m3u8]/bestaudio[protocol=http]/bestaudio/best';

export function isYouTubeMediaUrl(value){
  try{
    const url=new URL(String(value||''));
    const host=url.hostname.toLowerCase();
    return url.protocol==='https:'&&(host==='youtube.com'||host.endsWith('.youtube.com')||host==='googlevideo.com'||host.endsWith('.googlevideo.com'));
  }catch{return false}
}

export function withYouTubeFfmpegHeaders(args=[]){
  if(!Array.isArray(args))return args;
  const inputIndex=args.indexOf('-i');
  if(inputIndex<0||!isYouTubeMediaUrl(args[inputIndex+1]))return args;
  const before=args.slice(0,inputIndex),after=args.slice(inputIndex);
  if(!before.includes('-user_agent'))before.push('-user_agent',youtubeFfmpegUserAgent);
  if(!before.includes('-headers'))before.push('-headers',youtubeFfmpegHeaders);
  return [...before,...after];
}

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

export function withYouTubePlaybackClient(args=[]){
  if(!isYouTubePlaybackResolutionArgs(args))return args;
  const patched=[...args];
  const extractorArgs=()=>patched.flatMap((value,index)=>value==='--extractor-args'?[String(patched[index+1]||'')]:[]);
  let configured=extractorArgs().some(value=>value.includes('youtube:player_client='));
  if(!configured){
    patched.unshift('--extractor-args',`youtube:player_client=${youtubePlaybackClient}`);
    configured=true;
  }
  const usesMweb=extractorArgs().some(value=>/(?:^|[;,])youtube:player_client=mweb(?:$|[;,])/i.test(value));
  const hasPotProvider=extractorArgs().some(value=>value.includes('youtubepot-bgutil'));
  if(usesMweb&&!hasPotProvider)patched.unshift('--extractor-args',youtubePotProviderArgs);
  const formatIndex=patched.indexOf('-f');
  if(formatIndex>=0&&formatIndex+1<patched.length)patched[formatIndex+1]=youtubePlaybackFormat;
  return patched;
}

const originalSpawn=childProcess.spawn;
if(!childProcess.__musikbot187YoutubeHeadersInstalled){
  Object.defineProperty(childProcess,'__musikbot187YoutubeHeadersInstalled',{value:true,configurable:false,enumerable:false,writable:false});
  childProcess.spawn=function(command,args,options){
    const executable=String(command||'').split(/[\\/]/).at(-1)?.toLowerCase();
    const patched=executable==='ffmpeg'?withYouTubeFfmpegHeaders(args):executable==='yt-dlp'?withYouTubePlaybackClient(args):args;
    return originalSpawn.call(this,command,patched,options);
  };
  syncBuiltinESMExports();
}
