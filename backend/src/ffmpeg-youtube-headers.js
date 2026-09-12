import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';

export const youtubeFfmpegUserAgent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
export const youtubeFfmpegHeaders='Referer: https://www.youtube.com/\r\nOrigin: https://www.youtube.com\r\n';

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

const originalSpawn=childProcess.spawn;
if(!childProcess.__musikbot187YoutubeHeadersInstalled){
  Object.defineProperty(childProcess,'__musikbot187YoutubeHeadersInstalled',{value:true,configurable:false,enumerable:false,writable:false});
  childProcess.spawn=function(command,args,options){
    const executable=String(command||'').split(/[\\/]/).at(-1)?.toLowerCase();
    const patched=executable==='ffmpeg'?withYouTubeFfmpegHeaders(args):args;
    return originalSpawn.call(this,command,patched,options);
  };
  syncBuiltinESMExports();
}
