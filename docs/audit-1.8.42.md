# Musikbot audit 1.8.42

Base: `f5ab59ce5246b96d2b84603db3027d8f2bd2b667` (1.8.41).

## Findings and changes

| Area | Finding | Result |
| --- | --- | --- |
| Spotify matching | PR #68 fixes real search-result shapes: Release Topic artist echoes and title-only slowed suffixes. | Integrated with existing wrong-version, wrong-artist and duration regression coverage. |
| Personal mix | PR #67 changes the mix to 80/20 but leaves 50/50 tests and UI text. It also adds a fixed 2026 search term. | Integrated priority and discovery filtering, synchronized UI/docs/tests, removed the fixed year and unused search paths/variables. Diversity and repeated-refill tests pass. |
| Learning reset | PR #59 exposes full reset but does not invalidate pending searches. | Integrated both reset scopes, invalidated pending generations, added race and API persistence tests. Full reset covers learning exclusions and block terms, not Spotify playlist sync exclusions. |
| Early transitions | A ready deck can start during the 12-second preparation lead; a small incoming buffer can shorten the outgoing track. | Fade selection now waits until the remaining tail fits both the transition window and incoming PCM buffer. Player-level regression exercises early readiness and partial buffers. |
| Playback lag/recovery | Existing jitter-buffer, 403 recovery, premature-end retry, pause and PCM transport behavior reviewed against tests. | Regression suite and local PCM benchmark pass. Production network stalls and audible quality still require a live session. |
| Missing playlist tracks | Matching fixes above address false rejects. Existing import, pagination, public fallback and sync tests pass. | No speculative changes to playlist deletion or sync exclusions. Public Spotify responses and the 500-track import bound still limit available tracks. |
| Configuration/dependencies | Unused `maxQueue: 100` contradicted the player's actual 500-track limit. URL pathname was unsafe for Windows/spaces. Three dependency audit findings blocked CI. | Removed dead option, converted frontend URL using `fileURLToPath`, patched Fastify/fast-uri/undici without major upgrades. |

## Verification

- Baseline: 287 backend tests passed.
- Consolidated changes: 294 backend tests passed, including long-running mix refill/restart simulations.
- Both Playwright browser tests passed.
- `npm audit`: zero vulnerabilities.
- Local two-player PCM benchmark: approximately 0.21% projected single-core usage; native Opus unavailable on Windows with Node 26. Ubuntu CI is the authoritative native-Opus check.
- No real Discord/TeamSpeak listening session or authenticated Spotify/YouTube end-to-end run was performed. Matching correctness is covered by deterministic fixtures, not a claim that every live catalog track resolves.

The original open PRs #59, #67 and #68 are consolidated by this change and should not be independently reapplied.
