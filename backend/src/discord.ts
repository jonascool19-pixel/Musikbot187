import {Client,GatewayIntentBits,ChannelType,REST,Routes,SlashCommandBuilder,type ChatInputCommandInteraction} from "discord.js";
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
    this.client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.GuildVoiceStates]});
  }
}

const commandData=()=>[
  new SlashCommandBuilder().setName("play").setDescription("Musik abspielen").addStringOption(o=>o.setName("suche").setDescription("Titel, Interpret oder URL").setRequired(true)),
  new SlashCommandBuilder().setName("pause").setDescription("Wiedergabe pausieren"),
  new SlashCommandBuilder().setName("resume").setDescription("Wiedergabe fortsetzen"),
  new SlashCommandBuilder().setName("skip").setDescription("Aktuellen Titel überspringen"),
  new SlashCommandBuilder().setName("stop").setDescription("Wiedergabe stoppen"),
  new SlashCommandBuilder().setName("volume").setDescription("Lautstärke setzen").addIntegerOption(o=>o.setName("wert").setDescription("0 bis 100").setRequired(true).setMinValue(0).setMaxValue(100)),
  new SlashCommandBuilder().setName("queue").setDescription("Warteschlange anzeigen"),
].map(x=>x.toJSON());

function discordError(error:unknown):Error{
  const e=error as any;
  const code=String(e?.code||"");
  const message=e instanceof Error?e.message:String(error);
  if(code==="TokenInvalid") return new Error("Discord-Token ist ungültig. Bitte den Bot-Token aus dem Discord Developer Portal neu kopieren.");
  if(code==="DisallowedIntents") return new Error("Discord verweigert einen privilegierten Gateway-Intent. Die Verbindung wurde deshalb beendet.");
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
    r.client.on("interactionCreate",async i=>{if(!i.isChatInputCommand())return;try{await this.handleSlash(i)}catch(e){const msg=e instanceof Error?e.message:String(e);if(i.replied||i.deferred)await i.followUp({content:`Fehler: ${msg}`,ephemeral:true});else await i.reply({content:`Fehler: ${msg}`,ephemeral:true})}}});
    r.client.on("messageCreate",async m=>{
      // Prefix commands are optional and require Message Content Intent in the Discord Developer Portal.
      if(m.author.bot||!m.guild||!m.content?.startsWith(cfg.prefix))return;
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
      if(r.client.user){
        try{const rest=new REST({version:"10"}).setToken(cfg.token);await rest.put(Routes.applicationCommands(r.client.user.id),{body:commandData()});}catch(e){console.error("Discord command registration failed",e)}
      }
    }catch(e){
      r.connecting=false;
      try{await r.client.destroy()}catch{}
      throw discordError(e);
    }
  }

  private async handleSlash(i:ChatInputCommandInteraction){
    switch(i.commandName){
      case "play":{const q=i.options.getString("suche",true);await this.music.enqueue([{id:Date.now().toString(),title:q,url:`ytsearch1:${q}`,source:"youtube"}]);await i.reply(`▶️ **${q}** wurde zur Wiedergabe hinzugefügt.`);break;}
      case "pause":this.music.pause();await i.reply("⏸️ Pausiert.");break;
      case "resume":this.music.resume();await i.reply("▶️ Fortgesetzt.");break;
      case "skip":this.music.skip();await i.reply("⏭️ Übersprungen.");break;
      case "stop":this.music.stop();await i.reply("⏹️ Gestoppt.");break;
      case "volume":{const v=i.options.getInteger("wert",true);this.music.setVolume(v);await i.reply(`🔊 Lautstärke: **${v}%**`);break;}
      case "queue":await i.reply(this.music.queue.map(x=>x.title).join("\n")||"Queue ist leer.");break;
    }
  }

  async disconnect(id:string){const r=this.map.get(id);if(!r)return;try{r.voice?.destroy();r.stream?.end();await r.client.destroy()}finally{this.map.delete(id)}}
  async join(id:string){
    const r=this.map.get(id);if(!r)throw new Error("Instanz nicht verbunden. Erst 'Verbinden' drücken.");
    if(!r.cfg.guildId||!r.cfg.channelId)throw new Error("Bitte zuerst Discord-Server und Voice-Kanal auswählen.");
    const g=r.client.guilds.cache.get(r.cfg.guildId);if(!g)throw new Error("Discord-Server wurde mit diesem Bot nicht gefunden. Prüfe Server-ID und ob der Bot wirklich eingeladen wurde.");
    const channel=g.channels.cache.get(r.cfg.channelId);if(!channel||channel.type!==ChannelType.GuildVoice)throw new Error("Der ausgewählte Voice-Kanal wurde nicht gefunden.");
    try{r.voice=joinVoiceChannel({guildId:g.id,channelId:r.cfg.channelId,adapterCreator:g.voiceAdapterCreator});r.player=createAudioPlayer();r.voice.subscribe(r.player);r.stream=new PassThrough();r.player.play(createAudioResource(r.stream,{inputType:StreamType.Raw}))}catch(e){throw new Error(`Voice-Verbindung fehlgeschlagen: ${e instanceof Error?e.message:String(e)}`)}
  }
  writeAudio(data:Buffer,id:string){this.map.get(id)?.stream?.write(data)}
  guilds(id:string){const r=this.map.get(id);return r?[...r.client.guilds.cache.values()].map(g=>({id:g.id,name:g.name})):[]}
  channels(id:string,guildId:string){const r=this.map.get(id),g=r?.client.guilds.cache.get(guildId);return g?[...g.channels.cache.values()].filter(c=>c.type===ChannelType.GuildVoice).map(c=>({id:c.id,name:c.name})):[]}
  status(){return [...this.map.values()].map(r=>({id:r.cfg.id,name:r.cfg.name,enabled:r.cfg.enabled,connected:true,guildId:r.cfg.guildId,channelId:r.cfg.channelId,inviteUrl:r.cfg.clientId&&/^\d{17,20}$/.test(r.cfg.clientId)?`https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(r.cfg.clientId)}&scope=bot%20applications.commands&permissions=36700160`:""}))}
}
