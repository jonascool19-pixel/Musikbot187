import path from 'node:path';

const dataDir = path.resolve(process.env.MUSIKBOT187_DATA_DIR || '/var/lib/musikbot187');
export const config = Object.freeze({
  host: process.env.MUSIKBOT187_HOST || '0.0.0.0',
  port: Number(process.env.MUSIKBOT187_PORT || 3000),
  dataDir,
  musicDir: path.join(dataDir, 'music'),
  stateFile: path.join(dataDir, 'state.json'),
  secretFile: path.join(dataDir, 'secret.key'),
  setupToken: process.env.MUSIKBOT187_SETUP_TOKEN || '',
  frontendDir: path.resolve(process.env.MUSIKBOT187_FRONTEND_DIR || new URL('../../frontend', import.meta.url).pathname),
  controlSocket: process.env.MUSIKBOT187_CONTROL_SOCKET || '/run/musikbot187/control.sock',
  sessionTtlMs: 12 * 60 * 60 * 1000,
  maxSessions: 5,
  maxQueue: 100,
  maxPlaylist: 500,
  maxUpload: 128 * 1024 * 1024,
  musicQuota: 10 * 1024 ** 3
});
