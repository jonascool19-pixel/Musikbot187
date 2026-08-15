import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';

export type BotConfig = any;
export const DATA_DIR = process.env.DATA_DIR ?? '/var/lib/radiobot';
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o750 });

export function defaultConfig() {
  return {
    version: 2,
    auth: { user: '', salt: '', hash: '' },
    setupComplete: false,
    setupToken: randomBytes(24).toString('hex'),
    activeInstance: 'discord-main',
    instances: { discord: [], ts3: [], spotify: [] },
    playlists: [],
    uiOrder: ['hero','discord','ts3','search','radio','media','playlists','spotify','youtube','system','queue'],
    settings: { prefix: '!', volume: 80 }
  };
}

export function readConfig(): BotConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    const cfg = defaultConfig();
    writeConfig(cfg);
    return cfg;
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    const backup = `${CONFIG_FILE}.broken-${Date.now()}`;
    fs.renameSync(CONFIG_FILE, backup);
    const cfg = defaultConfig();
    writeConfig(cfg);
    return cfg;
  }
}

export function writeConfig(cfg: BotConfig) {
  const tmp = `${CONFIG_FILE}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, CONFIG_FILE);
}

export function passwordHash(password: string, salt?: string) {
  const actualSalt = salt ?? randomBytes(16).toString('hex');
  return { salt: actualSalt, hash: scryptSync(password, Buffer.from(actualSalt, 'hex'), 64).toString('hex') };
}
