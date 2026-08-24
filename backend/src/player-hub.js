import {EventEmitter} from 'node:events';
import {Player} from './player.js';

export const localPlayerId='local';

export class PlayerHub extends EventEmitter{
  constructor({musicDir,diagnostic}){super();this.musicDir=musicDir;this.diagnostic=diagnostic;this.players=new Map();this.selectedId=localPlayerId;this.ensure(localPlayerId);}
  ensure(id=localPlayerId){const key=String(id||localPlayerId);if(this.players.has(key))return this.players.get(key);const player=new Player({musicDir:this.musicDir,diagnostic:this.diagnostic});player.on('pcm',buffer=>this.emit('pcm',{playerId:key,buffer}));player.on('state',state=>{this.emit('instance-state',key,state);if(key===this.selectedId)this.emit('state',this.state())});this.players.set(key,player);return player;}
  for(id){return this.ensure(id)}
  select(id=localPlayerId){this.selectedId=String(id||localPlayerId);this.ensure(this.selectedId);this.emit('state',this.state());return this.state()}
  stateFor(id){return this.ensure(id).state()}
  state(){const active=this.ensure(this.selectedId).state();return {...active,contextId:this.selectedId,contexts:[...this.players].map(([id,player])=>{const value=player.state();return {id,playing:Boolean(value.current),paused:value.paused,title:value.current?.title||'',queueLength:value.queue.length}})}}
  snapshot(){return {version:2,selectedId:this.selectedId,players:[...this.players].map(([id,player])=>({id,snapshot:player.snapshot()}))}}
  restore(value){if(value?.version!==2)return this.active().restore(value);let restored=false;for(const entry of value.players||[]){if(!entry?.id)continue;restored=this.ensure(entry.id).restore(entry.snapshot)||restored}return restored}
  removePlayer(id){const key=String(id||'');if(!key||key===localPlayerId)return false;const player=this.players.get(key);if(!player)return false;player.stop();player.removeAllListeners();this.players.delete(key);if(this.selectedId===key)this.select(localPlayerId);return true}
  close(){for(const player of this.players.values())player.stop();this.removeAllListeners()}
  active(){return this.ensure(this.selectedId)}
  get current(){return this.active().current}get queue(){return this.active().queue}get volume(){return this.active().volume}get mode(){return this.active().mode}get paused(){return this.active().paused}
  add(...args){return this.active().add(...args)}clear(...args){return this.active().clear(...args)}setVolume(...args){return this.active().setVolume(...args)}setMode(...args){return this.active().setMode(...args)}pause(...args){return this.active().pause(...args)}resume(...args){return this.active().resume(...args)}stop(...args){return this.active().stop(...args)}skip(...args){return this.active().skip(...args)}seekBy(...args){return this.active().seekBy(...args)}
  remove(index){return this.active().remove(index)}
}
