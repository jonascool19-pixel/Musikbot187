# Dashboard / Frontend – 100-Pass Audit

Stand: 2026-08-19, Branch `audit/dashboard-frontend-100pass`

This audit treats the dashboard as a cross-layer client: HTML bootstrap, script ordering, authentication, permissions, API contracts, state rendering, player controls, playlists, connections, system monitoring, admin UI, themes, persistence, browser behavior, and CI coverage.

## 100 checks

| # | Area | Check | Result |
|---:|---|---|---|
| 01 | Bootstrap | HTML document loads with UTF-8/viewport | PASS |
| 02 | Bootstrap | Frontend static root is served by backend | PASS |
| 03 | Bootstrap | CSS entrypoint is present | PASS |
| 04 | Bootstrap | Admin CSS is present | PASS |
| 05 | Bootstrap | Dashboard root exists before JS render | PASS |
| 06 | Bootstrap | Script order exposes fetch/theme primitives before app | PASS |
| 07 | Bootstrap | UUID polyfill precedes player code | PASS |
| 08 | Bootstrap | Setup guard is loaded | PASS |
| 09 | Bootstrap | Error logging is loaded | PASS |
| 10 | Bootstrap | Dashboard browser test boots the page | PASS |
| 11 | Auth | Login uses `/api/login` | PASS |
| 12 | Auth | Login accepts backend `name` contract | PASS |
| 13 | Auth | Legacy `username` is normalized | PASS |
| 14 | Auth | Successful login is persisted in sessionStorage | PASS |
| 15 | Auth | Auth state is not stored in localStorage | PASS |
| 16 | Auth | Protected requests receive Bearer auth | PASS |
| 17 | Auth | Logout calls backend logout | PASS |
| 18 | Auth | Logout clears client auth state | PASS |
| 19 | Auth | Setup response can establish initial session | PASS |
| 20 | Auth | Expired setup bootstrap state is discarded | PASS |
| 21 | API | API errors are surfaced as user-visible notices | PASS |
| 22 | API | JSON response failures do not crash rendering | PASS |
| 23 | API | Search query is URL encoded | PASS |
| 24 | API | Search source is URL encoded | PASS |
| 25 | API | Player POST bodies are JSON | PASS |
| 26 | API | Queue deletion uses DELETE | PASS |
| 27 | API | Playlist item creation uses the playlist item endpoint | PASS |
| 28 | API | Settings are persisted through `/api/settings` | PASS |
| 29 | API | User creation uses `/api/users` | PASS |
| 30 | API | Permission updates use stable user IDs | FIXED |
| 31 | Navigation | Player tab exists | PASS |
| 32 | Navigation | Playlist tab exists | PASS |
| 33 | Navigation | Connection tab exists | PASS |
| 34 | Navigation | System tab exists | PASS |
| 35 | Navigation | Admin tab is restricted to administrators | PASS |
| 36 | Navigation | Connection tab is hidden without `connections.manage` | FIXED |
| 37 | Navigation | System tab is hidden without `diagnostics.view` | FIXED |
| 38 | Navigation | Active tab state is synchronized | PASS |
| 39 | Navigation | Logout remains reachable from every dashboard view | PASS |
| 40 | Navigation | Navigation survives dashboard rerenders | PASS |
| 41 | Player | Current track is escaped before HTML insertion | PASS |
| 42 | Player | Queue titles are escaped | PASS |
| 43 | Player | Search results are escaped | PASS |
| 44 | Player | Volume range is constrained in UI | PASS |
| 45 | Player | Mode is selected from supported modes | PASS |
| 46 | Player | Pause/resume/skip/stop/clear controls exist | PASS |
| 47 | Player | Queue removal calls backend | PASS |
| 48 | Player | Search playback has a dedicated play-now path | PASS |
| 49 | Player | Skip has a busy guard | PASS |
| 50 | Player | Player refresh reloads state | PASS |
| 51 | Search | YouTube/radio/Spotify result groups are supported | PASS |
| 52 | Search | Empty search is rejected client-side | PASS |
| 53 | Search | Empty result state is rendered | PASS |
| 54 | Search | Search failures clear the result area | PASS |
| 55 | Search | Search requests inherit authentication | PASS |
| 56 | Playlists | Playlist list is loaded from backend | PASS |
| 57 | Playlists | Playlist names are escaped | PASS |
| 58 | Playlists | Playlist items are escaped | PASS |
| 59 | Playlists | Playlist playback action exists | PASS |
| 60 | Playlists | Playlist deletion is represented by backend contract | PASS |
| 61 | Connections | Discord list is rendered | PASS |
| 62 | Connections | TeamSpeak list is rendered | PASS |
| 63 | Connections | Discord invite URL validates client IDs | PASS |
| 64 | Connections | Discord invite permissions are consistent | FIXED |
| 65 | Connections | Discord server loading has a busy state | PASS |
| 66 | Connections | Discord voice loading has a busy state | PASS |
| 67 | Connections | Discord voice join has a busy state | PASS |
| 68 | Connections | New Discord instance shortcut exists | PASS |
| 69 | Connections | TS3 state is exposed in dashboard | PASS |
| 70 | Connections | Connection actions use authenticated requests | PASS |
| 71 | System | CPU metrics render | PASS |
| 72 | System | RAM metrics render | PASS |
| 73 | System | Network RX metrics render | PASS |
| 74 | System | Network TX metrics render | PASS |
| 75 | System | Uptime formatting exists | PASS |
| 76 | System | Monitor polling has a fixed interval | PASS |
| 77 | System | Monitor polling failures do not crash the page | PASS |
| 78 | System | Storage information is represented | PASS |
| 79 | System | Diagnostic messages are escaped | PASS |
| 80 | System | Diagnostic access is permission-protected by backend | PASS |
| 81 | Admin | User creation validates required fields client-side | PASS |
| 82 | Admin | User list uses escaped names | PASS |
| 83 | Admin | Actual user permissions are displayed | FIXED |
| 84 | Admin | Permission editor resolves users by stable ID | FIXED |
| 85 | Admin | Admin role maps to all permissions | PASS |
| 86 | Admin | Custom user permissions can be edited | PASS |
| 87 | Admin | Design settings are persisted | PASS |
| 88 | Admin | All backend-supported themes are selectable | FIXED |
| 89 | Admin | Accent color is persisted | PASS |
| 90 | Admin | Player/output settings remain accessible in admin UI | FIXED |
| 91 | Admin | Music directory remains editable | PASS |
| 92 | Admin | Diagnostics are lazy-loaded | PASS |
| 93 | Admin | Admin notices are escaped as text | PASS |
| 94 | Themes | Theme definitions include all eight supported themes | PASS |
| 95 | Themes | Custom accent is validated | PASS |
| 96 | Themes | Theme application updates CSS variables | PASS |
| 97 | Browser | Existing mock dashboard regression remains available | PASS |
| 98 | Browser | A real-backend dashboard E2E now exists | ADDED |
| 99 | Browser | Real-backend E2E verifies persisted admin settings | ADDED |
| 100 | Browser | Real-backend E2E verifies user permissions end-to-end | ADDED |

## Findings fixed in this pass

### F-01 – Admin overhaul dropped player/output settings

The new admin replacement rendered only theme and music-directory settings. Existing backend settings for volume, mode, output type, output ID and network interface were therefore no longer reachable from the admin dashboard. The replacement UI now exposes and persists those values.

### F-02 – Theme selector exposed only three of eight themes

The frontend theme engine and backend support eight themes (`dark`, `light`, `ocean`, `purple`, `emerald`, `red`, `amber`, `slate`), while the admin replacement exposed only three. The selector now uses the complete theme list.

### F-03 – Permission list displayed role defaults, not actual permissions

The user list previously displayed hard-coded role text. A user with custom permissions could therefore appear to have the default permission set even though the backend stored something else. The list now renders the actual permission set returned by `/api/users`.

### F-04 – Permission editor identified users by name

The editor previously searched `/api/users` by username. The UI now carries the immutable user ID in `data-user-id` and resolves the target by ID.

### F-05 – Dashboard exposed permission-protected tabs to users who could not use them

`connections` and `system` were rendered for every non-admin user although the backend requires `connections.manage` and `diagnostics.view`. A small permission-aware navigation layer now hides those tabs when the logged-in user lacks the corresponding permission.

### F-06 – Discord invite links used two different permission masks

The main dashboard used `3148800`, while the compatibility UI used `36700160`. The compatibility path now uses the same mask as the canonical Discord action implementation.

### F-07 – Browser regression mocked the entire backend contract

The existing browser test is useful for deterministic UI coverage but can hide real API integration errors. A second Playwright test now starts the real backend in an isolated temporary data directory, performs first-run setup, logs in, exercises system/connections/admin flows, persists settings, creates a user, edits permissions, and verifies the resulting backend state.

## Remaining architectural observations

- The frontend still contains several historical compatibility/fix scripts. They should be consolidated only after the new real-backend E2E is stable; deleting them in this pass would increase regression risk.
- The granular backend permission model is broader than the current admin navigation model. Non-admin users can hold permissions such as `users.manage`, `settings.manage`, or `music.manage`, but the current main navigation does not expose the admin surface to those users. This is a product/authorization UX decision rather than a backend authorization bypass. It should be addressed in a dedicated permissions-navigation pass if such delegated administration is intended.
- The original mock browser test should remain because it catches deterministic DOM regressions; the new real-backend E2E is complementary rather than a replacement.
