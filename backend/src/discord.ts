import {Client,GatewayIntentBits,ChannelType} from "discord.js";
import {createAudioPlayer,createAudioResource,joinVoiceChannel,StreamType,type VoiceConnection,AudioPlayer} from "@discordjs/voice";
import {PassThrough} from "node:stream";
import type {DiscordInstance} from "./types.js";
import type {Player} from "./player.js";

class Runtime{
  client:Client;
  voice?:VoiceConnection;
  player?:AudioPlayer;
  stream?:PassThrough;
  connecting=false;
  constructor(public cfg:DiscordInstance){
    this.client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent,GatewayIntentBits.GuildVoiceStates]});
  }
}

function discordError(error:unknown):Error{
  const e=error as any;
  const code=String(e?.code||"");
  const message=e instanceof Error?e.message:String(error);
  if(code==="TokenInvalid") return new Error("Discord-Token ist ungültig. Bitte den Bot-Token aus dem Discord Developer Portal neu kopieren.");
  if(code==="DisallowedIntents") return new Error("Discord lehnt die benötigten Privileged Intents ab. Aktiviere MESSAGE CONTENT INTENT und SERVER MEMBERS INTENT im Developer Portal.");
  if(code==="50001") return new Error("Discord-Bot hat keinen Zugriff auf den ausgewählten Server.");
  if(code==="50013") return new Error("Discord-Bot fehlen Berechtigungen für den ausgewählten Server oder Voice-Kanal.");
  return new Error(message||"Discord-Verbindung fehlgeschlagen");
}

export class DiscordManager{
  private map=new Map<string,Runtime>();
  constructor(private music:Player){}

  async connect(cfg:DiscordInstance){
    const existing=this.map.get(cfg.id);
    if(existing?.connecting) throw new Error("Discord-Instanz verbindet bereits. Bitte kurz warten.");
    await this.disconnect(cfg.id);
    if(!cfg.enabled)throw new Error("Instanz ist ausgeschaltet");
    if(!cfg.token)throw new Error("Bot-Token fehlt");
    const r=new Runtime(cfg);r.connecting=true;
    r.client.on("messageCreate",async m=>{
      if(m.author.bot||!m.guild||!m.content.startsWith(cfg.prefix))return;
      const [cmd,...args]=m.content.slice(cfg.prefix.length).trim().split(/\s+/);
      try{
        if(cmd==="play")await this.music.enqueue([{id:Date.now().toString(),title:args.join(" "),url:`ytsearch1:${args.join(" ")}`,source:"youtube"}]);
        else if(cmd==="pause")this.music.pause();
        else if(cmd==="resume")this.music.resume();
        else if(cmd==="skip")this.music.skip();
        else if(cmd==="stop")this.music.stop();
        else if(cmd==="volume"&&args[0])this.music.setVolume(Number(args[0]));
        else if(cmd==="queue")await m.reply(this.music.queue.map(x=>x.title).join("\n")||"Queue ist leer.");
      }catch(e){await m.reply(`Fehler: ${e instanceof Error?e.message:String(e)}`)}
    });
    try{
      await r.client.login(cfg.token);
      r.connecting=false;
      this.map.set(cfg.id,r);
    }catch(e){
      r.connecting=false;
      try{await r.client.destroy()}catch{}
      throw discordError(e);
    }
  }

  async disconnect(id:string){
    const r=this.map.get(id);if(!r)return;
    try{r.voice?.destroy();r.stream?.end();await r.client.destroy();}finally{this.map.delete(id)}
  }

  async join(id:string){
    const r=this.map.get(id);if(!r)throw new Error("Instanz nicht verbunden. Erst 'Verbinden' drücken.");
    if(!r.cfg.guildId||!r.cfg.channelId)throw new Error("Bitte zuerst Discord-Server und Voice-Kanal auswählen.");
    const g=r.client.guilds.cache.get(r.cfg.guildId);if(!g)throw new Error("Discord-Server wurde mit diesem Bot nicht gefunden. Prüfe Server-ID und ob der Bot wirklich eingeladen wurde.");
    const channel=g.channels.cache.get(r.cfg.channelId);
    if(!channel||channel.type!==ChannelType.GuildVoice)throw new Error("Der ausgewählte Voice-Kanal wurde nicht gefunden.");
    try{
      r.voice=joinVoiceChannel({guildId:g.id,channelId:r.cfg.channelId,adapterCreator:g.voiceAdapterCreator});
      r.player=createAudioPlayer();r.voice.subscribe(r.player);r.stream=new PassThrough();r.player.play(createAudioResource(r.stream,{inputType:StreamType.Raw}));
    }catch(e){throw new Error(`Voice-Verbindung fehlgeschlagen: ${e instanceof Error?e.message:String(e)}`)}
  }

  writeAudio(data:Buffer,id:string){this.map.get(id)?.stream?.write(data)}
  guilds(id:string){const r=this.map.get(id);return r?[...r.client.guilds.cache.values()].map(g=>({id:g.id,name:g.name})):[]}
  channels(id:string,guildId:string){const r=this.map.get(id),g=r?.client.guilds.cache.get(guildId);return g?[...g.channels.cache.values()].filter(c=>c.type===ChannelType.GuildVoice).map(c=>({id:c.id,name:c.name})):[]}
  status(){return [...this.map.values()].map(r=>({id:r.cfg.id,name:r.cfg.name,enabled:r.cfg.enabled,connected:true,guildId:r.cfg.guildId,channelId:r.cfg.channelId,inviteUrl:r.cfg.clientId&&/^\d{17,20}$/.test(r.cfg.clientId)?`https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(r.cfg.clientId)}&scope=bot%20applications.commands&permissions=36700160`:""}))}
}
