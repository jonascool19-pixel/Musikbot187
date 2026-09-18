import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {ffmpegPipeArgs} from '../backend/src/player.js';
import {playbackYouTubePageUrl,youtubePlaybackPipeArgs} from '../backend/src/media.js';
import {createYouTubePlaybackPipeline} from '../backend/src/youtube-playback-pipe.js';

class FakeChild extends EventEmitter{
  constructor(name){super();this.name=name;this.stdin=new PassThrough();this.stdout=new PassThrough();this.stderr=new PassThrough();this.signals=[];this.pid=name==='ffmpeg'?222:111;}
  kill(signal='SIGTERM'){this.signals.push(signal);return true}
}

test('YouTube/Spotify playback page URLs are canonical and stdout args keep yt-dlp in charge of HTTP',()=>{
  assert.equal(playbackYouTubePageUrl({source:'youtube',id:'abcdefghijk'}),'https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(playbackYouTubePageUrl({source:'spotify',playbackVideoId:'lmnopqrstuv'}),'https://www.youtube.com/watch?v=lmnopqrstuv');
  assert.equal(playbackYouTubePageUrl({source:'radio',url:'https://example.invalid'}),'');
  const args=youtubePlaybackPipeArgs('https://youtu.be/abcdefghijk');
  assert.equal(args[args.indexOf('-o')+1],'-');
  assert.equal(args[args.indexOf('-f')+1].startsWith('bestaudio'),true);
  assert.equal(args.includes('--abort-on-unavailable-fragments'),true);
  assert.equal(args.at(-1),'https://www.youtube.com/watch?v=abcdefghijk');
});

test('FFmpeg pipe decoder never opens a GoogleVideo URL and keeps precise output seek',()=>{
  const args=ffmpegPipeArgs(83.625);
  assert.deepEqual(args.slice(args.indexOf('-i'),args.indexOf('-i')+2),['-i','pipe:0']);
  assert.deepEqual(args.slice(args.indexOf('-ss'),args.indexOf('-ss')+2),['-ss','83.625']);
  assert.ok(args.indexOf('-ss')>args.indexOf('-i'),'pipe resume seek must happen after the non-seekable stdin input');
  assert.equal(args.some(value=>/googlevideo|youtube\.com/i.test(String(value))),false);
  assert.equal(args.includes('-reconnect'),false);
});

test('yt-dlp stdout is physically piped into FFmpeg stdin and downloader failures fail the combined child',async()=>{
  const calls=[],children=[];
  const spawnImpl=(command,args,options)=>{const child=new FakeChild(command);calls.push({command,args,options,child});children.push(child);return child};
  const pipeline=createYouTubePlaybackPipeline({source:'youtube',id:'abcdefghijk'},12.5,{spawnImpl,decoderArgs:ffmpegPipeArgs});
  assert.deepEqual(calls.map(call=>call.command),['yt-dlp','ffmpeg']);
  assert.equal(calls[0].args[calls[0].args.indexOf('-o')+1],'-');
  assert.deepEqual(calls[1].args.slice(calls[1].args.indexOf('-i'),calls[1].args.indexOf('-i')+2),['-i','pipe:0']);

  let received=Buffer.alloc(0);
  children[1].stdin.on('data',chunk=>received=Buffer.concat([received,chunk]));
  children[0].stdout.write(Buffer.from('compressed-audio'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(received.toString(),'compressed-audio');

  let errors='';
  pipeline.stderr.on('data',chunk=>errors+=chunk.toString());
  children[0].stderr.write('ERROR: HTTP Error 403: Forbidden\n');
  children[0].stdout.end();
  children[0].emit('close',1);
  children[1].emit('close',0);
  const closeCode=await new Promise(resolve=>pipeline.once('close',resolve));
  assert.equal(closeCode,1);
  assert.match(errors,/403/);
});

test('pipeline pause/resume/kill controls downloader and decoder together',()=>{
  const children=[],spawnImpl=command=>{const child=new FakeChild(command);children.push(child);return child};
  const pipeline=createYouTubePlaybackPipeline({source:'spotify',playbackVideoId:'abcdefghijk'},0,{spawnImpl,decoderArgs:ffmpegPipeArgs});
  pipeline.kill('SIGSTOP');pipeline.kill('SIGCONT');pipeline.kill('SIGKILL');
  for(const child of children)assert.deepEqual(child.signals,['SIGSTOP','SIGCONT','SIGKILL']);
  assert.equal(pipeline.killed,true);
});
