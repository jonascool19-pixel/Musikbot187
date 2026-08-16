import {Client,GatewayIntentBits,ChannelType} from "discord.js";
import {joinVoiceChannel,createAudioPlayer,createAudioResource,StreamType,VoiceConnection,AudioPlayer} from "@discordjs/voice";
import {PassThrough} from "node:stream";
import {DISCORD_TOKEN} from "./config.js";
export class DiscordManager{
 client?:Client; connected=false; voice?:VoiceConnection; player?:AudioPlayer; stream?:PassThrough;
 async connect(token=DISCORD_TOKEN){if(!token)throw new Error("Discord Token fehlt");if(this.client)await this.client.destroy();this.client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildVoiceStates]});await this.client.login(token);this.connected=true;return this.status()}
 async disconnect(){this.voice?.destroy();this.voice=undefined;this.player=undefined;this.stream?.end();this.stream=undefined;if(this.client){this.client.destroy();this.client=undefined}this.connected=false}
 async join(guildId:string,channelId:string){if(!this.client)throw new Error("Discord nicht verbunden");const g=this.client.guilds.cache.get(guildId);if(!g)throw new Error("Guild nicht gefunden");this.voice=joinVoiceChannel({channelId,guildId,adapterCreator:g.voiceAdapterCreator});this.player=createAudioPlayer();this.voice.subscribe(this.player);return {joined:true}}
 attachAudio(data:Buffer){if(!this.player)return;if(!this.stream){this.stream=new PassThrough();this.player.play(createAudioResource(this.stream,{inputType:StreamType.Raw,inlineVolume:true}))}this.stream.write(data)}
 async status(){return {connected:this.connected,guilds:this.client?.guilds.cache.size||0,voice:!!this.voice}}
 async guilds(){return this.client?[...this.client.guilds.cache.values()].map(g=>({id:g.id,name:g.name})):[]}
 async channels(guildId:string){const g=this.client?.guilds.cache.get(guildId);return g?[...g.channels.cache.values()].filter(c=>c.type===ChannelType.GuildVoice).map(c=>({id:c.id,name:c.name})):[]}
}