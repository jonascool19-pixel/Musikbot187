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
