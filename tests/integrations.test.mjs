import test from 'node:test';
import assert from 'node:assert/strict';
import {discordOpusBitrate,discordPcmBufferBytes,discordPendingPcmBytes,flushDiscordPcm,IntegrationManager,writeDiscordPcm} from '../backend/src/integrations.js';

test('Discord uses the maximum supported Opus bitrate',()=>{assert.equal(discordOpusBitrate,128_000);});

test('Discord PCM transport bridges short backpressure without dropping the next audio block',()=>{const writes=[],runtime={stream:{destroyed:false,write:buffer=>{writes.push(buffer);return false}},backpressured:false,pendingPcm:[],pendingPcmBytes:0},first=Buffer.alloc(3840,1),second=Buffer.alloc(3840,2);assert.equal(discordPcmBufferBytes,384_000);assert.equal(discordPendingPcmBytes,192_000);assert.equal(writeDiscordPcm(runtime,first),false);assert.equal(runtime.backpressured,true);assert.equal(writeDiscordPcm(runtime,second),false);assert.equal(writes.length,1);assert.equal(runtime.pendingPcmBytes,second.length);runtime.stream.write=next=>{writes.push(next);return true};assert.equal(flushDiscordPcm(runtime),true);assert.equal(runtime.pendingPcmBytes,0);assert.deepEqual(writes,[first,second]);});

test('Discord jitter queue stays bounded during a prolonged slow consumer',()=>{const runtime={stream:{destroyed:false,write:()=>false},backpressured:false,pendingPcm:[],pendingPcmBytes:0},buffer=Buffer.alloc(3840);writeDiscordPcm(runtime,buffer);for(let index=0;index<100;index++)writeDiscordPcm(runtime,Buffer.from(buffer));assert.ok(runtime.pendingPcmBytes<=discordPendingPcmBytes);assert.ok(runtime.pendingPcm.length>0);});

test('Discord playback resources are replaced on every track without repeating transport signals on volume-only state changes',()=>{const calls=[];const runtime={type:'discord',playbackId:null,lastPaused:null,prepare(id){calls.push(['prepare',id]);this.playbackId=id},reset(){calls.push(['reset']);this.playbackId=null},audio:{pause:force=>calls.push(['pause',force]),unpause:()=>calls.push(['unpause'])}};const manager=Object.create(IntegrationManager.prototype);manager.runtimes=new Map([['discord-1',runtime]]);manager.syncPlayback({current:{title:'Eins'},playbackId:11,paused:false});manager.syncPlayback({current:{title:'Eins'},playbackId:11,paused:false,volume:33});manager.syncPlayback({current:{title:'Eins'},playbackId:11,paused:true});manager.syncPlayback({current:{title:'Zwei'},playbackId:12,paused:false});manager.syncPlayback({current:null,playbackId:null,paused:false});assert.deepEqual(calls,[['prepare',11],['unpause'],['pause',true],['prepare',12],['unpause'],['reset']]);});

test('Discord presence shows the current title as listening activity and clears on pause',()=>{const presences=[],runtime={type:'discord',status:'online',ActivityType:{Listening:2},client:{user:{setPresence:value=>presences.push(value)}},playbackId:1,lastPaused:false,lastPresence:null,prepare(){},reset(){},audio:{pause(){},unpause(){}}},manager=Object.create(IntegrationManager.prototype);manager.runtimes=new Map([['discord-1',runtime]]);manager.syncPlayback({current:{title:'bigFM'},playbackId:1,paused:false});manager.syncPlayback({current:{title:'bigFM'},playbackId:1,paused:false});manager.syncPlayback({current:{title:'bigFM'},playbackId:1,paused:true});assert.deepEqual(presences,[{activities:[{name:'bigFM',type:2}],status:'online'},{activities:[],status:'online'}]);});

test('Discord option discovery returns ordinary arrays for visible guilds and voice channels',()=>{
  const voice={id:'200000000000000001',name:'Musik',isVoiceBased:()=>true};
  const text={id:'200000000000000002',name:'chat',isVoiceBased:()=>false};
  const guild={id:'100000000000000001',name:'Testserver',channels:{cache:new Map([[voice.id,voice],[text.id,text]])}};
  const manager=Object.create(IntegrationManager.prototype);
  manager.runtimes=new Map([['discord-1',{status:'online',detail:'TestBot',client:{isReady:()=>true,guilds:{cache:new Map([[guild.id,guild]])}}}]]);
  assert.deepEqual(manager.discordOptions('discord-1'),{status:'online',detail:'TestBot',guilds:[{id:guild.id,name:guild.name}],voiceChannels:[{id:voice.id,name:voice.name,guildId:guild.id,guildName:guild.name}]});
  assert.deepEqual(manager.discordOptions('missing'),{status:'offline',detail:'Discord-Bot ist nicht verbunden.',guilds:[],voiceChannels:[]});
});

test('Discord voice channel can be entered explicitly and replaces an old voice connection',async()=>{
  const voice={id:'200000000000000001',name:'Musik',isVoiceBased:()=>true};
  const guild={id:'100000000000000001',name:'Testserver',voiceAdapterCreator:{},channels:{cache:new Map([[voice.id,voice]])}};
  let destroyed=false,subscribed=null,options=null;
  const runtime={type:'discord',status:'online',detail:'TestBot',audio:{id:'audio'},voice:{destroy:()=>{destroyed=true}},joinVoiceChannel:value=>{options=value;return {subscribe:audio=>{subscribed=audio}}},client:{isReady:()=>true,user:{tag:'TestBot'},guilds:{cache:new Map([[guild.id,guild]])}}};
  const manager=Object.create(IntegrationManager.prototype);manager.runtimes=new Map([['discord-1',runtime]]);
  const result=await manager.joinDiscordVoice({id:'discord-1',name:'Discord',guildId:guild.id,voiceChannelId:voice.id});
  assert.equal(destroyed,true);assert.equal(subscribed,runtime.audio);assert.deepEqual(options,{channelId:voice.id,guildId:guild.id,adapterCreator:guild.voiceAdapterCreator,selfDeaf:true});assert.deepEqual(result,{guildId:guild.id,channelId:voice.id,channelName:'Musik'});assert.match(runtime.detail,/Voice: Musik/);
  await assert.rejects(manager.joinDiscordVoice({id:'missing',guildId:guild.id,voiceChannelId:voice.id}),/nicht verbunden/);
});

test('failed integration login closes and removes the partial runtime',async()=>{let closed=false;const manager=Object.create(IntegrationManager.prototype);manager.runtimes=new Map();manager.connectDiscord=async connection=>{manager.runtimes.set(connection.id,{close:async()=>{closed=true}});throw new Error('Login fehlgeschlagen')};await assert.rejects(manager.connect({id:'discord-1',type:'discord'}),/Login fehlgeschlagen/);assert.equal(closed,true);assert.equal(manager.runtimes.has('discord-1'),false);});

test('disconnect removes a runtime even when its close handler fails',async()=>{const manager=Object.create(IntegrationManager.prototype);manager.runtimes=new Map([['discord-1',{close:async()=>{throw new Error('Close fehlgeschlagen')}}]]);await assert.rejects(manager.disconnect('discord-1'),/Close fehlgeschlagen/);assert.equal(manager.runtimes.has('discord-1'),false);});

test('slow Discord slash searches are acknowledged before their final answer',async()=>{const calls=[],manager=Object.create(IntegrationManager.prototype);let finishSearch;manager.handleCommand=()=>new Promise(resolve=>{finishSearch=resolve});const interaction={guildId:'guild-1',commandName:'play',options:{getString:()=> 'Sommerjam',getInteger:()=>null},deferReply:async()=>{calls.push('defer')},editReply:async value=>{calls.push(value)}};const pending=manager.handleInteraction(interaction,{id:'discord-1',guildId:'guild-1'});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls,['defer']);finishSearch('Hinzugefügt: Sommerjam');await pending;assert.deepEqual(calls,['defer','Hinzugefügt: Sommerjam']);});

test('Discord slash command errors are returned without escaping the event handler',async()=>{const manager=Object.create(IntegrationManager.prototype),answers=[];manager.handleCommand=async()=>{throw new Error('Suche fehlgeschlagen')};const interaction={guildId:'guild-1',commandName:'play',options:{getString:()=> 'Sommerjam',getInteger:()=>null},deferReply:async()=>{},editReply:async value=>answers.push(value)};await manager.handleInteraction(interaction,{id:'discord-1',guildId:'guild-1'});assert.deepEqual(answers,['Fehler: Suche fehlgeschlagen']);});
