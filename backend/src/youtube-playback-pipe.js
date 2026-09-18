import childProcess from 'node:child_process';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {playbackYouTubePageUrl,youtubePlaybackPipeArgs} from './media.js';

export function createYouTubePlaybackPipeline(item,resumeSeconds,{spawnImpl=childProcess.spawn,decoderArgs}={}){
  if(typeof decoderArgs!=='function')throw new TypeError('decoderArgs muss eine Funktion sein.');
  const pageUrl=playbackYouTubePageUrl(item);
  if(!pageUrl)throw new Error('Für den Online-Titel fehlt eine gültige YouTube-Video-ID.');
  const downloader=spawnImpl('yt-dlp',youtubePlaybackPipeArgs(pageUrl),{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const decoder=spawnImpl('ffmpeg',decoderArgs(resumeSeconds),{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const pipeline=new EventEmitter(),stderr=new PassThrough();
  pipeline.stdout=decoder.stdout;
  pipeline.stderr=stderr;
  pipeline.pid=decoder.pid;
  pipeline.downloader=downloader;
  pipeline.decoder=decoder;
  pipeline.killed=false;

  let downloaderClosed=false,decoderClosed=false,downloaderCode=null,decoderCode=null,closed=false;
  const relay=stream=>stream?.on?.('data',chunk=>stderr.write(chunk));
  relay(downloader.stderr);relay(decoder.stderr);
  decoder.stdin?.on?.('error',()=>{});
  downloader.stdout?.pipe?.(decoder.stdin);

  const emitClose=()=>{
    if(closed||!downloaderClosed||!decoderClosed)return;
    closed=true;stderr.end();
    const code=Number(downloaderCode)||Number(decoderCode)||0;
    pipeline.emit('close',code);
  };
  const fail=error=>{if(!closed)pipeline.emit('error',error)};
  downloader.on?.('error',error=>{fail(error);decoder.kill?.('SIGKILL')});
  decoder.on?.('error',error=>{fail(error);downloader.kill?.('SIGKILL')});
  downloader.on?.('close',code=>{downloaderClosed=true;downloaderCode=code;emitClose()});
  decoder.on?.('close',code=>{decoderClosed=true;decoderCode=code;if(Number(code)!==0&&!downloaderClosed)downloader.kill?.('SIGKILL');emitClose()});

  pipeline.kill=(signal='SIGTERM')=>{
    const resultA=downloader.kill?.(signal),resultB=decoder.kill?.(signal);
    if(signal!=='SIGSTOP'&&signal!=='SIGCONT')pipeline.killed=true;
    return Boolean(resultA||resultB);
  };
  return pipeline;
}
