# Dashboard / Frontend – 100-Pass Audit

Stand: 2026-08-19, Branch `audit/dashboard-frontend-100pass-v2`

This audit treats the dashboard as a cross-layer client: HTML bootstrap, script ordering, authentication, permissions, API contracts, state rendering, player controls, playlists, connections, system monitoring, admin UI, themes, persistence, browser behavior, and CI coverage.

## 100 checks

The original 100 checks from the first dashboard audit were rerun against the current dashboard/frontend implementation. The previously identified F-01 through F-07 changes are included on this branch and rechecked. The second pass additionally tested delegated-permission UI, theme/accent behavior across all themes, and authenticated real-backend browser assertions.

| Range | Result |
|---|---|
| 01-10 Bootstrap | PASS |
| 11-20 Authentication/session | PASS |
| 21-30 API/error contracts | PASS |
| 31-40 Navigation/permissions | PASS after fixes |
| 41-50 Player/queue | PASS |
| 51-60 Search/playlists | PASS |
| 61-70 Discord/TeamSpeak | PASS |
| 71-80 System/diagnostics | PASS for permitted admin flow |
| 81-90 Admin/settings | PASS after fixes |
| 91-100 Themes/browser/E2E | PASS after fixes |

## Findings fixed in the second deep pass

### F-08 – Custom accent color was ignored by six themes

`themes.js` only applied the user-selected accent for `dark` and `light`. `ocean`, `purple`, `emerald`, `red`, `amber`, and `slate` silently kept their built-in accent even though the dashboard stored the custom color. The theme engine now validates and applies a custom six-digit hex accent to every supported theme.

### F-09 – Design tab was exposed without `design.manage`

The enhancement layer created the Design tab for every authenticated user, but `/api/settings` requires `settings.manage` for design changes. A normal user could therefore see a control that always returned 403. The Design tab is now installed only when the user has `design.manage` (or is an administrator), and the action itself performs the same permission check.

### F-10 – Output selector was exposed without `settings.manage`

The header enhancement rendered the output-instance selector for every authenticated user. Changing it writes `/api/settings` with `outputType`/`outputId`, which is not covered by the player-only settings exception and therefore requires `settings.manage`. The selector is now hidden unless the current user has that permission.

### F-11 – Music management tab was exposed without `music.manage`

The Music UI registered its extra navigation tab for every authenticated user, while `/api/files` and `/api/music/*` require `music.manage`. The tab is now registered only for administrators or users with `music.manage`, and the renderer performs the same check defensively.

### F-12 – Real-backend dashboard E2E used unauthenticated browser fetches for final assertions

The E2E test created a valid dashboard session but then called `/api/state` and `/api/users` from `page.evaluate()` without an Authorization header. Those calls did not actually verify the authenticated backend state. The assertions now read the session token from sessionStorage and send the Bearer header explicitly.

### F-13 – Missing delegated-permission E2E coverage

The original real-backend E2E only exercised an administrator. A separate real-backend Playwright test now creates a restricted user with `player.control`, `playlists.manage`, and `music.manage`, verifies that Player/Playlists/Music are available, verifies Connections/System/Admin/Design are hidden, verifies the output selector is hidden, and verifies a direct unauthorized settings write receives HTTP 403.

## 100-pass conclusion

No unresolved dashboard/frontend defect was left in the current findings list after F-01 through F-13 were addressed on this audit branch. The two most important classes of regression are now covered by real-backend browser tests: persisted admin state and permission-aware UI/API behavior.

## Remaining architectural observations

- The frontend still contains historical compatibility/fix scripts and multiple `window.fetch` wrappers. They currently coexist, but this is technical debt and should be consolidated only as a dedicated refactor with browser coverage.
- The granular backend permission model is broader than the current main navigation. Delegated permissions such as `users.manage`, `settings.manage`, and `diagnostics.view` can be assigned, but some corresponding surfaces remain intentionally admin-oriented. The audit treats the current permission-aware visibility as the safe behavior rather than inventing a new delegated-admin UX.
- The existing mock browser regression remains useful for deterministic DOM coverage; the real-backend E2E tests are complementary and are now authoritative for API-contract integration.
