import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFile, writeFile, chmod, mkdir } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve(process.env.MUSIKBOT187_DATA_DIR || path.resolve(process.cwd(), "../data"));
const KEY_FILE = path.join(DATA_DIR, ".secret-key");
let cachedKey = null;

async function key() {
  if (cachedKey) return cachedKey;
  try {
    const data = await readFile(KEY_FILE);
    if (data.length === 32) return (cachedKey = data);
  } catch {}
  const generated = randomBytes(32);
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(KEY_FILE, generated, { mode: 0o600 });
  try { await chmod(KEY_FILE, 0o600); } catch {}
  cachedKey = generated;
  return cachedKey;
}
export async function encryptSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.startsWith("enc$")) return text;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await key(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `enc$${iv.toString("base64url")}$${cipher.getAuthTag().toString("base64url")}$${encrypted.toString("base64url")}`;
}
export async function decryptSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  if (!text.startsWith("enc$")) return text;
  const [, ivText, tagText, payloadText] = text.split("$");
  if (!ivText || !tagText || !payloadText) throw new Error("Ungültig verschlüsseltes Geheimnis");
  const decipher = createDecipheriv("aes-256-gcm", await key(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(payloadText, "base64url")), decipher.final()]).toString("utf8");
}
