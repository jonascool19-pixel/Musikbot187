import {EventEmitter} from 'node:events';
import {Player} from './player.js';

export const localPlayerId='local';

export class PlayerHub extends EventEmitter{
  constructor({musicDir,diagnostic}){super();this.musicDir=musicDir;this.diagnostic=diagnostic;this.players=new Map();this.aliases=new Map();this.selectedId=localPlayerId;this.ensure(localPlayerId);}
  resolve(id=localPlayerId){let key=String(id||localPlayerId);const seen=new Set();while(this.aliases.has(key)&&!seen.has(key)){seen.add(key);key=this.aliases.get(key)}return key}
  ensure(id=localPlayerId){const key=this.resolve(id);if(this.players.has(key))return this.players.get(key);const player=new Player({musicDir:this.musicDir,diagnostic:this.diagnostic});player.on('pcm',buffer=>this.emit('pcm',{playerId:key,buffer}));player.on('state',state=>{this.emit('instance-state',key,state);if(this.resolve(this.selectedId)===key)this.emit('state',this.state())});this.players.set(key,player);return player;}
  setAlias(id,target=null){const key=String(id||'');if(!key||key===localPlayerId)throw new Error('Der lokale Player kann nicht gespiegelt werden.');const source=String(target||'');if(!source||source===key){this.aliases.delete(key);this.ensure(key)}else{const resolved=this.resolve(source);if(resolved===key)throw new Error('Eine Player-Spiegelung darf keinen Kreis bilden.');this.aliases.set(key,resolved);const old=this.players.get(key);if(old){old.stop();old.removeAllListeners();this.players.delete(key)}this.ensure(resolved)}if(this.selectedId===key)this.emit('state',this.state());return this.stateFor(key)}
  isAlias(id){return this.aliases.has(String(id||''))}
  for(id){return this.ensure(id)}
  select(id=localPlayerId){this.selectedId=String(id||localPlayerId);this.ensure(this.selectedId);this.emit('state',this.state());return this.state()}
  stateFor(id){return this.ensure(id).state()}
  state(){const sourceId=this.resolve(this.selectedId),active=this.ensure(sourceId).state(),ids=[...new Set([...this.players.keys(),...this.aliases.keys()])];return {...active,contextId:this.selectedId,sourceContextId:sourceId,mirrored:sourceId!==this.selectedId,contexts:ids.map(id=>{const resolved=this.resolve(id),value=this.ensure(resolved).state();return {id,sourceId:resolved,mirrored:resolved!==id,playing:Boolean(value.current),paused:value.paused,title:value.current?.title||'',queueLength:value.queue.length}})}}
  snapshot(){return {version:2,selectedId:this.selectedId,players:[...this.players].map(([id,player])=>({id,snapshot:player.snapshot()}))}}
  restore(value){if(value?.version!==2)return this.active().restore(value);let restored=false;for(const entry of value.players||[]){if(!entry?.id||this.isAlias(entry.id))continue;restored=this.ensure(entry.id).restore(entry.snapshot)||restored}return restored}
  removePlayer(id){const key=String(id||'');if(!key||key===localPlayerId)return false;const wasAlias=this.aliases.delete(key),player=this.players.get(key);if(player){player.stop();player.removeAllListeners();this.players.delete(key)}if(this.selectedId===key)this.select(localPlayerId);return wasAlias||Boolean(player)}
  close(){for(const player of this.players.values())player.stop();this.removeAllListeners()}
  active(){return this.ensure(this.resolve(this.selectedId))}
  get current(){return this.active().current}get queue(){return this.active().queue}get volume(){return this.active().volume}get mode(){return this.active().mode}get paused(){return this.active().paused}
  add(...args){return this.active().add(...args)}startPlaylist(...args){return this.active().startPlaylist(...args)}clear(...args){return this.active().clear(...args)}setVolume(...args){return this.active().setVolume(...args)}setMode(...args){return this.active().setMode(...args)}pause(...args){return this.active().pause(...args)}resume(...args){return this.active().resume(...args)}stop(...args){return this.active().stop(...args)}skip(...args){return this.active().skip(...args)}seekBy(...args){return this.active().seekBy(...args)}
  remove(index){return this.active().remove(index)}move(index,targetIndex){return this.active().move(index,targetIndex)}
}
