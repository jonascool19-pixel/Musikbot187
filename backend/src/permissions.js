export const PERMISSIONS = Object.freeze({
  PLAYER_CONTROL: "player.control",
  PLAYLISTS_MANAGE: "playlists.manage",
  MUSIC_MANAGE: "music.manage",
  CONNECTIONS_MANAGE: "connections.manage",
  SETTINGS_MANAGE: "settings.manage",
  DESIGN_MANAGE: "design.manage",
  USERS_MANAGE: "users.manage",
  DIAGNOSTICS_VIEW: "diagnostics.view",
  SYSTEM_MANAGE: "system.manage"
});

export const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));
export const DEFAULT_USER_PERMISSIONS = Object.freeze([
  PERMISSIONS.PLAYER_CONTROL,
  PERMISSIONS.PLAYLISTS_MANAGE
]);

export const PERMISSION_LABELS = Object.freeze({
  [PERMISSIONS.PLAYER_CONTROL]: "Player steuern",
  [PERMISSIONS.PLAYLISTS_MANAGE]: "Playlists verwalten",
  [PERMISSIONS.MUSIC_MANAGE]: "Musikbibliothek verwalten",
  [PERMISSIONS.CONNECTIONS_MANAGE]: "Verbindungen verwalten",
  [PERMISSIONS.SETTINGS_MANAGE]: "Einstellungen verwalten",
  [PERMISSIONS.DESIGN_MANAGE]: "Design verwalten",
  [PERMISSIONS.USERS_MANAGE]: "Benutzer verwalten",
  [PERMISSIONS.DIAGNOSTICS_VIEW]: "Diagnose ansehen",
  [PERMISSIONS.SYSTEM_MANAGE]: "System verwalten"
});

export function normalizePermissions(value, role = "user") {
  if (role === "admin") return [...ALL_PERMISSIONS];
  const input = Array.isArray(value) ? value : DEFAULT_USER_PERMISSIONS;
  return [...new Set(input.filter(permission => ALL_PERMISSIONS.includes(permission)))];
}

export function hasPermission(user, permission) {
  if (!user || !permission) return false;
  if (user.role === "admin") return true;
  return normalizePermissions(user.permissions, user.role).includes(permission);
}

export function requiredPermission(request) {
  const url = String(request.routeOptions?.url || request.url || "").split("?")[0];
  const method = String(request.method || "GET").toUpperCase();
  if (url === "/api/users" || url.startsWith("/api/users/")) return PERMISSIONS.USERS_MANAGE;
  if (url === "/api/diagnostics") return PERMISSIONS.DIAGNOSTICS_VIEW;
  if (url === "/api/network" || url === "/api/system" || url === "/api/storage") return PERMISSIONS.DIAGNOSTICS_VIEW;
  if (url === "/api/control") return PERMISSIONS.SYSTEM_MANAGE;
  if (url === "/api/settings") {
    const keys = Object.keys(request.body && typeof request.body === "object" ? request.body : {});
    if (method === "PUT" && keys.length > 0 && keys.every(key => key === "volume" || key === "mode")) return PERMISSIONS.PLAYER_CONTROL;
    return PERMISSIONS.SETTINGS_MANAGE;
  }
  if (url === "/api/integration/spotify") return PERMISSIONS.SETTINGS_MANAGE;
  if (url.startsWith("/api/discord") || url.startsWith("/api/ts3")) return PERMISSIONS.CONNECTIONS_MANAGE;
  if (url === "/api/music/upload" || url.startsWith("/api/music/")) return PERMISSIONS.MUSIC_MANAGE;
  if (url === "/api/files") return PERMISSIONS.MUSIC_MANAGE;
  if (url === "/api/play" || url.startsWith("/api/play/") || url.startsWith("/api/queue")) return PERMISSIONS.PLAYER_CONTROL;
  if (url === "/api/playlists" || url.startsWith("/api/playlists/")) return PERMISSIONS.PLAYLISTS_MANAGE;
  return null;
}
