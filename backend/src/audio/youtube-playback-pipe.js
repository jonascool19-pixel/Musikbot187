import childProcess from 'node:child_process';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonicalYouTubeVideoUrl,youtubePlaybackPipeArgs} from './youtube-client.js';
import {sharedYouTubeAccess} from '../youtube-access.js';

export function createYouTubePlaybackPipeline(url,resumeSeconds,{spawnImpl=childProcess.spawn,decoderArgs,accessGuard=sharedYouTubeAccess,metadataFile}={}){
  if(typeof decoderArgs!=='function')throw new TypeError('decoderArgs muss eine Funktion sein.');
  const accessGeneration=accessGuard.beginRequest();
  const pageUrl=canonicalYouTubeVideoUrl('',url);
  if(!pageUrl)throw new Error('Für den Online-Titel fehlt eine gültige YouTube-Video-ID.');
  const args=youtubePlaybackPipeArgs(pageUrl);
  if(metadataFile)args.splice(-1,0,'--print-to-file','before_dl:%(.{id,title,artist,artists,channel,duration})j',metadataFile);
  const downloader=spawnImpl('yt-dlp',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const decoder=spawnImpl('ffmpeg',decoderArgs(resumeSeconds),{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const pipeline=new EventEmitter(),stderr=new PassThrough();
  pipeline.on('error',error=>{pipeline.playbackError=error;});
  pipeline.stdout=decoder.stdout;
  pipeline.stderr=stderr;
  pipeline.pid=decoder.pid;
  pipeline.downloader=downloader;
  pipeline.decoder=decoder;
  pipeline.killed=false;

  let downloaderClosed=false,decoderClosed=false,downloaderCode=null,decoderCode=null,closed=false,downloaderErrors='';
  downloader.stderr?.on?.('data',chunk=>{downloaderErrors=(downloaderErrors+chunk.toString()).slice(-8192);stderr.write(chunk)});
  decoder.stderr?.on?.('data',chunk=>stderr.write(chunk));
  decoder.stdin?.on?.('error',()=>{});
  downloader.stdout?.pipe?.(decoder.stdin);

  const emitClose=()=>{
    if(closed||!downloaderClosed||!decoderClosed)return;
    closed=true;stderr.end();
    const code=downloaderCode!==0||decoderCode!==0?Number(downloaderCode)||Number(decoderCode)||1:0;
    pipeline.emit('close',code);
  };
  const fail=error=>{if(!closed)pipeline.emit('error',error)};
  downloader.on?.('error',error=>{fail(error);decoder.kill?.('SIGKILL')});
  decoder.on?.('error',error=>{fail(error);downloader.kill?.('SIGKILL')});
  downloader.on?.('close',code=>{downloaderClosed=true;downloaderCode=code;if(code===0)accessGuard.recoverRequest(accessGeneration);else if(code!==null){const blocked=accessGuard.blockFromError(new Error(downloaderErrors));if(blocked)pipeline.playbackError=blocked}emitClose()});
  decoder.on?.('close',code=>{decoderClosed=true;decoderCode=code;if(Number(code)!==0&&!downloaderClosed)downloader.kill?.('SIGKILL');emitClose()});

  pipeline.kill=(signal='SIGTERM')=>{
    const resultA=downloader.kill?.(signal),resultB=decoder.kill?.(signal);
    if(signal!=='SIGSTOP'&&signal!=='SIGCONT')pipeline.killed=true;
    return Boolean(resultA||resultB);
  };
  return pipeline;
}

export async function openYouTubePlaybackPipeline(url,resumeSeconds,{decoderArgs,signal,deadline}){
  signal?.throwIfAborted();
  if(Date.now()>=deadline)throw new Error('Zeitbudget für den Audiostart erschöpft.');
  const directory=mkdtempSync(join(tmpdir(),'musikbot-audio-'));
  const metadataFile=join(directory,'metadata.json');
  let child;
  try{
    child=createYouTubePlaybackPipeline(url,resumeSeconds,{decoderArgs,metadataFile});
    const metadata=await new Promise((resolve,reject)=>{
      let errors='';
      const capture=chunk=>{errors=(errors+chunk).slice(-1024);};
      const finish=(error,value)=>{
        clearTimeout(timer);
        signal?.removeEventListener('abort',abort);
        child.stdout.off('readable',ready);
        child.stderr.off('data',capture);
        child.off('close',closed);
        child.off('error',finish);
        if(error)reject(error);
        else resolve(value);
      };
      const abort=()=>finish(signal.reason);
      const closed=code=>finish(child.playbackError||new Error('YouTube-Audiostart fehlgeschlagen ('+code+'): '+errors));
      const ready=()=>{
        if(!child.stdout.readableLength)return;
        try{finish(null,JSON.parse(readFileSync(metadataFile,'utf8')));}
        catch(error){finish(error);}
      };
      const timer=setTimeout(()=>finish(new Error('Zeitüberschreitung beim YouTube-Audiostart.')),Math.max(1,deadline-Date.now()));
      child.stderr.on('data',capture);
      child.stdout.on('readable',ready);
      child.once('close',closed);
      child.on('error',finish);
      signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted)abort();
    });
    return {...metadata,url,protocol:'yt-dlp-pipe',client:'yt-dlp-pipe',child};
  }catch(error){
    child?.kill('SIGKILL');
    if(error.name!=='AbortError'&&!error.code)error.code='YOUTUBE_AUDIO_START_FAILED';
    throw error;
  }finally{
    rmSync(directory,{recursive:true,force:true});
  }
}
