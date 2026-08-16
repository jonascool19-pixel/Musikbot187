import path from "node:path";

export const DATA_DIR = process.env.MUSIKBOT187_DATA || "/var/lib/musikbot-187";
export const FRONTEND_DIR = path.resolve(process.env.MUSIKBOT187_FRONTEND || path.join(process.cwd(), "../frontend"));
export const HOST = process.env.HOST || "0.0.0.0";
export const PORT = Number(process.env.PORT || 3000);
export const YTDLP = process.env.YTDLP_PATH || "yt-dlp";
export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
export const DATA_FILE = path.join(DATA_DIR, "state.json");
