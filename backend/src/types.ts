export type Role="admin"|"user";
export type Source="youtube"|"radio"|"spotify"|"file";
export type Mode="queue"|"repeat"|"shuffle";
export interface MediaItem{id:string;title:string;url:string;source:Source;artist?:string;thumbnail?:string;duration?:number}
export interface Tile{id:string;title:string;icon:string;theme:string;locked:boolean}
export interface DiscordInstance{id:string;name:string;enabled:boolean;token:string;clientId:string;guildId:string;channelId:string;prefix:string}
export interface TS3Instance{id:string;name:string;enabled:boolean;host:string;port:number;channel:string;nickname:string;password?:string}
export interface State{version:2;users:{id:string;name:string;hash:string;role:Role}[];playlists:{id:string;name:string;items:MediaItem[]}[];settings:{volume:number;mode:Mode;outputType:"discord"|"ts3"|"none";outputId:string;networkInterface:string;filesDirectory:string;theme:string};integration:{spotifyClientId:string;spotifyClientSecret:string};dashboard:Tile[];discord:DiscordInstance[];ts3:TS3Instance[];diagnostics:{time:string;message:string}[]}
