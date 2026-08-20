import path from 'node:path';

const dataDir = process.env.MUSIKBOT187_DATA_DIR || '/var/lib/musikbot187';
export const config = Object.freeze({
  dataDir,
  musicDir: path.join(dataDir, 'music'),
  stateFile: path.join(dataDir, 'state.json'),
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  setupToken: process.env.MUSIKBOT187_SETUP_TOKEN || '',
  sessionSecret: process.env.MUSIKBOT187_SESSION_SECRET || '',
  maxUploadBytes: 100 * 1024 * 1024,
  allowedExtensions: new Set(['.mp3','.wav','.flac','.ogg','.m4a','.aac','.opus']),
});
