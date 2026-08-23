import test from 'node:test';
import assert from 'node:assert/strict';
import {IntegrationManager} from '../backend/src/integrations.js';

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
