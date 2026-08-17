import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

const DATA_DIR = process.env.MUSIKBOT187_DATA_DIR || path.resolve(process.cwd(), "../data");
const FILE = path.join(DATA_DIR, "data.json");
let state = null;
const sessions = new Map();
const loginAttempts = new Map();
let saveChain = Promise.resolve();

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
  await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  try { state = JSON.parse(await readFile(FILE, "utf8")); }
  catch { state = defaults(); await save(); }
  state = { ...defaults(), ...state, settings: { ...defaults().settings, ...(state.settings || {}) }, integration: { ...defaults().integration, ...(state.integration || {}) } };
  state.users = (state.users || []).map((u) => ({ ...u, role: u.role === "admin" ? "admin" : "user" }));
  state.settings.filesDirectory = path.resolve(state.settings.filesDirectory || path.join(DATA_DIR, "music"));
  return state;
}
export function db() { if (!state) throw new Error("Datenbank wurde noch nicht geladen"); return state; }
export function save() {
  const snapshot = JSON.stringify(state, null, 2);
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`;
  saveChain = saveChain.then(async () => {
    await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
    await writeFile(tmp, snapshot, { mode: 0o600 });
    await rename(tmp, FILE);
  }).catch(async (error) => {
    try { await writeFile(tmp, snapshot, { mode: 0o600 }); await rename(tmp, FILE); }
    catch {}
    throw error;
  });
  return saveChain;
}

function hash(password) { return scryptSync(password, "musikbot187", 32); }
function check(password, hex) { try { return timingSafeEqual(hash(password), Buffer.from(hex, "hex")); } catch { return false; } }
function publicUser(u) { return { id: u.id, name: u.name, role: u.role }; }

export function createAdmin(name, password) {
  const u = { id: randomUUID(), name, hash: hash(password).toString("hex"), role: "admin" };
  db().users.push(u);
  return publicUser(u);
}
export function login(name, password) {
  const key = String(name || "").toLowerCase();
  const now = Date.now();
  const attempt = loginAttempts.get(key) || { count: 0, first: now, blockedUntil: 0 };
  if (attempt.first + 15 * 60 * 1000 <= now) { attempt.count = 0; attempt.first = now; attempt.blockedUntil = 0; }
  if (attempt.blockedUntil > now) return null;
  const u = db().users.find((x) => x.name === name);
  if (!u || !check(password, u.hash)) {
    attempt.count += 1;
    if (attempt.count >= 5) attempt.blockedUntil = now + 15 * 60 * 1000;
    loginAttempts.set(key, attempt);
    return null;
  }
  loginAttempts.delete(key);
  const token = `${randomUUID()}${randomUUID()}`;
  sessions.set(token, { userId: u.id, expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  return { token, user: publicUser(u) };
}
export function user(header) { if (!header) return null; const token = String(header).replace(/^Bearer\s+/i, ""); const s = sessions.get(token); if (!s || s.expires < Date.now()) { sessions.delete(token); return null; } return db().users.find((x) => x.id === s.userId) || null; }
export function publicDiscord() { return db().discord.map(({ token, ...x }) => x); }
export function publicTS3() { return db().ts3.map(({ password, ...x }) => x); }
export function setDiscord(instance) { const i = db().discord.findIndex((x) => x.id === instance.id); if (i >= 0) db().discord[i] = instance; else db().discord.push(instance); }
