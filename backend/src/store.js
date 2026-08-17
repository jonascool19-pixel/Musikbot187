import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

const DATA_DIR = process.env.MUSIKBOT187_DATA_DIR || path.resolve(process.cwd(), "../data");
const FILE = path.join(DATA_DIR, "data.json");
let state = null;
const sessions = new Map();

const defaults = () => ({
  users: [],
  settings: { volume: 80, mode: "queue", outputType: "none", outputId: "", networkInterface: "", filesDirectory: path.join(DATA_DIR, "music"), theme: "dark" },
  playlists: [],
  discord: [],
  ts3: [],
  dashboard: [],
  diagnostics: [],
  integration: { spotifyClientId: "", spotifyClientSecret: "" }
});

export async function load() {
  await mkdir(DATA_DIR, { recursive: true });
  try { state = JSON.parse(await readFile(FILE, "utf8")); }
  catch { state = defaults(); await save(); }
  state = { ...defaults(), ...state, settings: { ...defaults().settings, ...(state.settings || {}) }, integration: { ...defaults().integration, ...(state.integration || {}) } };
  state.settings.filesDirectory = path.resolve(state.settings.filesDirectory || path.join(DATA_DIR, "music"));
  return state;
}
export function db() { if (!state) throw new Error("Datenbank wurde noch nicht geladen"); return state; }
export async function save() { await mkdir(DATA_DIR, { recursive: true }); const tmp = `${FILE}.tmp`; await writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 }); await writeFile(FILE, await readFile(tmp), { mode: 0o600 }); }

function hash(password) { return scryptSync(password, "musikbot187", 32); }
function check(password, hex) { try { return timingSafeEqual(hash(password), Buffer.from(hex, "hex")); } catch { return false; } }
function publicUser(u) { return { id: u.id, name: u.name, role: u.role }; }

export function createAdmin(name, password) { const u = { id: randomUUID(), name, hash: hash(password).toString("hex"), role: "admin" }; db().users.push(u); return publicUser(u); }
export function login(name, password) { const u = db().users.find((x) => x.name === name && check(password, x.hash)); if (!u) return null; const token = `${randomUUID()}${randomUUID()}`; sessions.set(token, { userId: u.id, expires: Date.now() + 7 * 24 * 60 * 60 * 1000 }); return { token, user: publicUser(u) }; }
export function user(header) { if (!header) return null; const token = String(header).replace(/^Bearer\s+/i, ""); const s = sessions.get(token); if (!s || s.expires < Date.now()) { sessions.delete(token); return null; } return db().users.find((x) => x.id === s.userId) || null; }
export function publicDiscord() { return db().discord.map(({ token, ...x }) => x); }
export function publicTS3() { return db().ts3.map(({ password, ...x }) => x); }
export function setDiscord(instance) { const i = db().discord.findIndex((x) => x.id === instance.id); if (i >= 0) db().discord[i] = instance; else db().discord.push(instance); }
