import { spawn } from "node:child_process";
import { YTDLP } from "./config.js";
import type { IntegrationSettings, MediaItem } from "./types.js";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

export function youtubeSearch(query: string): Promise<MediaItem[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP, [`ytsearch8:${query}`, "--flat-playlist", "--dump-single-json", "--no-warnings", "--skip-download"]);
    let output = "";
    child.stdout.on("data", (data: Buffer) => { output += data.toString(); });
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code !== 0) return reject(new Error("yt-dlp search failed"));
      try {
        const data = JSON.parse(output);
        resolve((data.entries || []).map((entry: any) => ({
          id: entry.id || crypto.randomUUID(),
          title: entry.title || "Unbekannt",
          url: entry.webpage_url || entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
          source: "youtube",
          duration: entry.duration,
          thumbnail: entry.thumbnails?.[0]?.url,
          artist: entry.channel || entry.uploader
        })));
      } catch (error) { reject(error); }
    });
  });
}

export async function radioSearch(query: string): Promise<MediaItem[]> {
  const data = await json<any[]>(`https://de1.api.radio-browser.info/json/stations/search?limit=15&hidebroken=true&order=clickcount&reverse=true&name=${encodeURIComponent(query)}`);
  return data.map((station) => ({ id: station.stationuuid, title: station.name, url: station.url_resolved || station.url, source: "radio", thumbnail: station.favicon, artist: station.country }));
}

let spotifyAccessToken = "";
let spotifyExpiry = 0;
export async function spotifySearch(query: string, integration: IntegrationSettings): Promise<MediaItem[]> {
  if (!integration.spotifyClientId || !integration.spotifyClientSecret) return [];
  if (Date.now() >= spotifyExpiry) {
    const basic = Buffer.from(`${integration.spotifyClientId}:${integration.spotifyClientSecret}`).toString("base64");
    const token = await json<any>("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials"
    });
    spotifyAccessToken = token.access_token;
    spotifyExpiry = Date.now() + ((token.expires_in || 3600) - 60) * 1000;
  }
  const result = await json<any>(`https://api.spotify.com/v1/search?type=track&limit=8&q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${spotifyAccessToken}` } });
  return (result.tracks?.items || []).map((track: any) => ({
    id: track.id,
    title: `${track.name} — ${(track.artists || []).map((a: any) => a.name).join(", ")}`,
    url: track.external_urls?.spotify || "",
    source: "spotify",
    duration: (track.duration_ms || 0) / 1000,
    thumbnail: track.album?.images?.[0]?.url,
    artist: (track.artists || []).map((a: any) => a.name).join(", ")
  }));
}

export async function resolveStream(item: MediaItem, integration: IntegrationSettings): Promise<string> {
  if (item.source === "radio" || item.source === "file") return item.url;
  if (item.source === "spotify") {
    const matches = await youtubeSearch(item.title);
    if (!matches[0]) throw new Error("Kein passendes YouTube-Medium für Spotify-Titel gefunden");
    return resolveStream(matches[0], integration);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP, [item.url, "-g", "-f", "bestaudio/best", "--no-playlist", "--no-warnings"]);
    let output = "";
    child.stdout.on("data", (data: Buffer) => { output += data.toString(); });
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      const url = output.trim().split(/\r?\n/)[0];
      if (code !== 0 || !url) return reject(new Error("Stream konnte nicht aufgelöst werden"));
      resolve(url);
    });
  });
}
