import fs from 'node:fs/promises';
import { config } from './config.js';

const defaults={users:[],discord:[],ts3:[],playlists:[],settings:{prefix:'!',output:'discord'},meta:{createdAt:new Date().toISOString()}};
export class Store{
  constructor(){this.state=structuredClone(defaults)}
  async init(){await fs.mkdir(config.dataDir,{recursive:true});await fs.mkdir(config.musicDir,{recursive:true});try{this.state=JSON.parse(await fs.readFile(config.stateFile,'utf8'))}catch{await this.save()}}
  async save(){const tmp=`${config.stateFile}.tmp`;await fs.writeFile(tmp,JSON.stringify(this.state,null,2),'utf8');await fs.rename(tmp,config.stateFile)}
  user(name){return this.state.users.find(x=>x.name===name)}
  playlist(id){return this.state.playlists.find(x=>x.id===id)}
}
