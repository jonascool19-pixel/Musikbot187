import test from 'node:test';
import assert from 'node:assert/strict';
import {discordOpusBitrate,IntegrationManager} from '../backend/src/integrations.js';

test('Discord uses the maximum supported Opus bitrate',()=>{assert.equal(discordOpusBitrate,128_000);});

test('Discord playback resources are replaced on every track and follow pause/stop state',()=>{const calls=[];const runtime={type:'discord',playbackId:null,prepare(id){calls.push(['prepare',id]);this.playbackId=id},reset(){calls.push(['reset']);this.playbackId=null},audio:{pause:force=>calls.push(['pause',force]),unpause:()=>calls.push(['unpause'])}};const manager=Object.create(IntegrationManager.prototype);manager.runtimes=new Map([['discord-1',runtime]]);manager.syncPlayback({current:{title:'Eins'},playbackId:11,paused:false});manager.syncPlayback({current:{title:'Eins'},playbackId:11,paused:true});manager.syncPlayback({current:{title:'Zwei'},playbackId:12,paused:false});manager.syncPlayback({current:null,playbackId:null,paused:false});assert.deepEqual(calls,[['prepare',11],['unpause'],['pause',true],['prepare',12],['unpause'],['reset']]);});

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
