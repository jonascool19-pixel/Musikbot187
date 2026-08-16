import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { DATA_DIR, DATA_FILE } from "./config.js";
import type { AppState, DashboardTile, User } from "./types.js";

export const defaultTiles: DashboardTile[] = [
  { id: "now-playing", title: "Jetzt läuft", icon: "🎵", theme: "violet", locked: true },
  { id: "queue", title: "Queue", icon: "📋", theme: "blue", locked: true },
  { id: "mode", title: "Wiedergabemodus", icon: "🔁", theme: "indigo", locked: true },
  { id: "volume", title: "Lautstärke", icon: "🔊", theme: "green", locked: true },
  { id: "search", title: "Suche", icon: "🔎", theme: "emerald", locked: true },
  { id: "radio", title: "Radio", icon: "📻", theme: "orange", locked: true },
  { id: "playlists", title: "Playlists", icon: "💿", theme: "amber", locked: true },
  { id: "files", title: "Dateien", icon: "📁", theme: "yellow", locked: true },
  { id: "system", title: "CPU / RAM", icon: "🖥️", theme: "pink", locked: true },
  { id: "network", title: "Netzwerk", icon: "🌐", theme: "cyan", locked: true },
  { id: "instances", title: "Discord / TS3", icon: "🎧", theme: "indigo", locked: true },
  { id: "active-instance", title: "Aktive Instanz", icon: "🎯", theme: "red", locked: true }
];

const empty: AppState = {
  version: 1,
  users: [],
  playlists: [],
  settings: {
    volume: 80,
    mode: "queue",
    activeOutputType: "none",
    activeInstanceId: "",
    networkInterface: "auto",
    filesDirectory: "/var/lib/musikbot-187/files"
  },
  integration: { spotifyClientId: "", spotifyClientSecret: "" },
  dashboard: defaultTiles,
  discord: [],
  ts3: [],
  diagnostics: []
};

let state: AppState = structuredClone(empty);
let timer: ReturnType<typeof setTimeout> | undefined;

export async function loadState(): Promise<AppState> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    state = JSON.parse(await readFile(DATA_FILE, "utf8")) as AppState;
  } catch {
    state = structuredClone(empty);
    await writeFile(DATA_FILE, JSON.stringify(state, null, 2), "utf8");
  }
  return state;
}

export function db(): AppState { return state; }

export async function saveState(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void writeFile(DATA_FILE, JSON.stringify(state, null, 2), "utf8");
  }, 50);
}

function hashPassword(password: string): string { return scryptSync(password, "musikbot-187", 32).toString("hex"); }

export function passwordMatches(user: User, password: string): boolean {
  const a = Buffer.from(user.passwordHash, "hex");
  const b = Buffer.from(hashPassword(password), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const sessions = new Map<string, string>();

export function createAdmin(name: string, password: string): User {
  const user: User = { id: randomUUID(), name, passwordHash: hashPassword(password), role: "admin" };
  state.users.push(user);
  return user;
}

export function login(name: string, password: string): { token: string; user: Pick<User, "id" | "name" | "role"> } | null {
  const user = state.users.find((entry) => entry.name === name);
  if (!user || !passwordMatches(user, password)) return null;
  const token = randomUUID();
  sessions.set(token, user.id);
  return { token, user: { id: user.id, name: user.name, role: user.role } };
}

export function currentUser(authorization?: string): User | null {
  const token = String(authorization || "").replace(/^Bearer /, "");
  const userId = sessions.get(token);
  return state.users.find((entry) => entry.id === userId) || null;
}

export function publicDiscord() {
  return state.discord.map(({ token, ...item }) => ({ ...item, hasToken: Boolean(token) }));
}

export function publicTS3() {
  return state.ts3.map(({ password, ...item }) => ({ ...item, hasPassword: Boolean(password) }));
}
