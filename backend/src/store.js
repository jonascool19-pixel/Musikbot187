import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

const DATA_DIR = process.env.MUSIKBOT187_DATA_DIR || path.resolve(process.cwd(), "../data");
const FILE = path.join(DATA_DIR, "data.json");
let state = null;
const sessions = new Map();
const loginAttempts = new Map();
let saveChain = Promise.resolve();

const defaults = () => ({
  users: [],
  settings: { volume: 80, mode: "queue", outputType: "none", outputId: "", networkInterface: "", filesDirectory: path.join(DATA_DIR, "music"), theme: "dark", accentColor: "#0b69b3" },
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

const SCRYPT_KEYLEN = 32;
const SCRYPT_SALT_BYTES = 16;
const LEGACY_SALT = "musikbot187";
function hash(password) {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}
function check(password, encoded) {
  try {
    const value = String(encoded || "");
    if (value.startsWith("scrypt$")) {
      const [, saltHex, hashHex] = value.split("$");
      if (!/^[0-9a-f]{32}$/.test(saltHex) || !/^[0-9a-f]{64}$/.test(hashHex)) return false;
      const derived = scryptSync(password, Buffer.from(saltHex, "hex"), SCRYPT_KEYLEN);
      return timingSafeEqual(derived, Buffer.from(hashHex, "hex"));
    }
    const legacy = scryptSync(password, LEGACY_SALT, SCRYPT_KEYLEN);
    const stored = Buffer.from(value, "hex");
    return stored.length === legacy.length && timingSafeEqual(legacy, stored);
  } catch { return false; }
}
function isLegacyHash(encoded) { return /^[0-9a-f]{64}$/i.test(String(encoded || "")); }
function publicUser(u) { return { id: u.id, name: u.name, role: u.role }; }
function normalizeName(name) { return String(name || "").trim().toLowerCase(); }
export function loginRateKey(name, clientKey='unknown') { return `${String(clientKey || "unknown").trim() || "unknown"}:${normalizeName(name)}`; }

const AUTH_STATE_SWEEP_MS = 10 * 60 * 1000;
const AUTH_STATE_MAX_AGE_MS = 30 * 60 * 1000;
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const authStateSweep = setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) if (session.expires <= now) sessions.delete(token);
  for (const [key, attempt] of loginAttempts) {
    const lastActivity = Math.max(attempt.first || 0, attempt.last || 0, attempt.blockedUntil || 0);
    if (lastActivity + AUTH_STATE_MAX_AGE_MS <= now) loginAttempts.delete(key);
  }
}, AUTH_STATE_SWEEP_MS);
authStateSweep.unref?.();

export function createUser(name, password, role = "user") {
  const normalized = String(name || "").trim();
  if (!normalized) throw new Error("Benutzername fehlt");
  if (db().users.some((u) => normalizeName(u.name) === normalizeName(normalized))) throw new Error("Benutzername bereits vorhanden");
  const u = { id: randomUUID(), name: normalized, hash: hash(password), role: role === "admin" ? "admin" : "user" };
  db().users.push(u);
  return publicUser(u);
}
export function createAdmin(name, password) { return createUser(name, password, "admin"); }
export function login(name, password, clientKey='unknown') {
  const normalizedName = normalizeName(name);
  const key = loginRateKey(normalizedName, clientKey);
  const now = Date.now();
  const attempt = loginAttempts.get(key) || { count: 0, first: now, last: now, blockedUntil: 0 };
  if (attempt.first + 15 * 60 * 1000 <= now) { attempt.count = 0; attempt.first = now; attempt.blockedUntil = 0; }
  attempt.last = now;
  if (attempt.blockedUntil > now) { loginAttempts.set(key, attempt); return null; }
  const u = db().users.find((x) => normalizeName(x.name) === normalizedName);
  if (!u || !check(password, u.hash)) {
    attempt.count += 1;
    if (attempt.count >= 5) attempt.blockedUntil = now + 15 * 60 * 1000;
    loginAttempts.set(key, attempt);
    return null;
  }
  if (isLegacyHash(u.hash)) { u.hash = hash(password); void save(); }
  loginAttempts.delete(key);
  const token = `${randomUUID()}${randomUUID()}`;
  sessions.set(token, { userId: u.id, expires: Date.now() + SESSION_MAX_AGE_MS });
  return { token, user: publicUser(u) };
}
export function logout(header) {
  if (!header) return false;
  const token = String(header).replace(/^Bearer\s+/i, "");
  return sessions.delete(token);
}
export function logoutUser(userId) {
  let removed = 0;
  for (const [token, session] of sessions) if (session.userId === userId) { sessions.delete(token); removed += 1; }
  return removed;
}
export function user(header) { if (!header) return null; const token = String(header).replace(/^Bearer\s+/i, ""); const s = sessions.get(token); if (!s || s.expires < Date.now()) { sessions.delete(token); return null; } return db().users.find((x) => x.id === s.userId) || null; }
export function publicDiscord() { return db().discord.map(({ token, ...x }) => x); }
export function publicTS3() { return db().ts3.map(({ password, ...x }) => x); }
export function setDiscord(instance) { const i = db().discord.findIndex((x) => x.id === instance.id); if (i >= 0) db().discord[i] = instance; else db().discord.push(instance); }
