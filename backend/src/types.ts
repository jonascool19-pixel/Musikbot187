export type Role = "admin" | "user";
export type Source = "youtube" | "radio" | "spotify" | "file";
export type PlaybackMode = "queue" | "repeat" | "shuffle";

export type MediaItem = {
  id: string;
  title: string;
  url: string;
  source: Source;
  duration?: number;
  thumbnail?: string;
  artist?: string;
};

export type DashboardTile = {
  id: string;
  title: string;
  icon: string;
  theme: string;
  locked: boolean;
};

export type User = {
  id: string;
  name: string;
  passwordHash: string;
  role: Role;
};

export type DiscordInstance = {
  id: string;
  name: string;
  token: string;
  clientId: string;
  guildId: string;
  channelId: string;
  prefix: string;
};

export type TS3Instance = {
  id: string;
  name: string;
  host: string;
  port: number;
  channel: string;
  nickname: string;
  password?: string;
};

export type IntegrationSettings = {
  spotifyClientId: string;
  spotifyClientSecret: string;
};

export type AppSettings = {
  volume: number;
  mode: PlaybackMode;
  activeOutputType: "discord" | "ts3" | "none";
  activeInstanceId: string;
  networkInterface: string;
  filesDirectory: string;
};

export type AppState = {
  version: 1;
  users: User[];
  playlists: { id: string; name: string; items: MediaItem[] }[];
  settings: AppSettings;
  integration: IntegrationSettings;
  dashboard: DashboardTile[];
  discord: DiscordInstance[];
  ts3: TS3Instance[];
  diagnostics: { time: string; message: string }[];
};
