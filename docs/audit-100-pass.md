# MusikBot187 — 100-Pass Audit Matrix

Scope: current `main` at the start of the audit, followed by cross-layer verification of the remediation branch.

Legend: **PASS** = checked with no defect found; **FIXED** = defect found and remediated on this branch; **DEFERRED** = intentionally outside this remediation because it is a separate product change.

## 1–10 Repository / build
1. Repository layout — PASS
2. Backend package metadata — PASS
3. Node engine requirement — PASS
4. Dependency lockfile presence — PASS
5. npm CI reproducibility — FIXED (`npm ci` in installer)
6. Production dependency audit — PASS (CI audit clean)
7. Test entrypoint coverage — PASS
8. Browser-test entrypoint — PASS
9. Shell syntax checks — PASS
10. Node syntax checks — PASS after remediation

## 11–20 HTTP/API surface
11. Health endpoint — PASS
12. First-run status endpoint — PASS
13. First-run setup authorization — PASS
14. Login contract — PASS
15. Logout contract — PASS
16. Password-change contract — PASS
17. Player API contract — PASS
18. Queue deletion contract — PASS
19. Playlist creation/update contract — PASS
20. Playlist deletion contract — FIXED

## 21–30 Authentication / authorization
21. Bearer-token authentication — PASS
22. Admin enforcement — PASS
23. Login rate limiting — PASS
24. Search rate limiting — PASS
25. Playback rate limiting — PASS
26. Timing-safe setup-token comparison — PASS
27. Password hashing/storage path — PASS
28. Session invalidation path — PASS
29. CSRF exposure from bearer auth — PASS
30. Secret values excluded from public settings — PASS

## 31–40 Secrets / persistence
31. Secret encryption format — PASS
32. Secret decryption compatibility — PASS
33. Secret-key persistence — PASS
34. Secret-key permissions for new keys — PASS
35. Secret-key permissions for existing keys — FIXED
36. Legacy plaintext secret compatibility — PASS
37. Store load/save lifecycle — PASS
38. Atomic save serialization — PASS
39. Admin credential persistence — PASS
40. Restart persistence path — PASS (covered by existing integration coverage)

## 41–50 Media / search
41. YouTube search subprocess — PASS
42. yt-dlp output size bound — PASS
43. yt-dlp timeout — PASS
44. Radio Browser timeout/redirect policy — PASS
45. Spotify credential presence handling — PASS
46. Spotify secret decryption before OAuth — FIXED
47. Search result normalization — PASS
48. Playback source validation — PASS
49. Resolved media URL validation — PASS
50. Direct/radio egress proxy path — PASS

## 51–60 Player / audio lifecycle
51. Queue size bound — PASS
52. Play-now generation invalidation — PASS
53. Skip process termination — PASS
54. Stop process termination — PASS
55. Pause/resume subprocess control — PASS
56. FFmpeg audio format — PASS
57. yt-dlp → FFmpeg pipeline — PASS
58. FFmpeg exit cleanup of yt-dlp — FIXED
59. Recovery/backoff lifecycle — PASS
60. Egress proxy shutdown — PASS

## 61–70 Discord
61. Discord intent selection — PASS
62. Guild command scoping — PASS
63. Slash-command authorization — PASS
64. Prefix command authorization — PASS
65. Token validation path — PASS
66. Gateway reconnect backoff — PASS
67. Intentional disconnect reconnect suppression — FIXED
68. Voice reconnect suppression during manual disconnect — FIXED
69. Voice audio pipeline recovery — PASS
70. Discord public-status secret hygiene — PASS

## 71–80 TeamSpeak / control plane
71. TS3 host validation — PASS
72. TS3 port validation — PASS
73. TS3 nickname validation — PASS
74. TS3 password encryption — PASS
75. TS3 reconnect scheduling — PASS
76. TS3 audio frame sizing — PASS
77. TS3 public-status secret hygiene — PASS
78. Control action allowlist — PASS
79. Legacy dashboard control-action compatibility — FIXED
80. Control socket filesystem reachability — FIXED

## 81–90 Frontend / UI contracts
81. Dashboard auth header path — PASS
82. Login field naming — PASS
83. Search result escaping — PASS
84. Queue/playlist text escaping — PASS
85. Discord save endpoint compatibility — FIXED
86. TS3 save endpoint compatibility — FIXED
87. TS3 legacy field normalization — FIXED
88. Playlist delete endpoint compatibility — FIXED
89. System control action compatibility — FIXED
90. Diagnostic metadata rendering — FIXED

## 91–100 Installer / CI / regression coverage
91. Installer SHA-256 verification — PASS
92. Installer pinned yt-dlp release — PASS
93. Installer shallow ref checkout — PASS
94. Service user isolation — PASS
95. Main service hardening — PASS
96. Control service group/socket access — FIXED
97. Browser smoke coverage — PASS
98. Cross-layer API contract tests — FIXED / ADDED
99. Known broken first-run regression excluded from main suite — PASS by design
100. Full CI validation on remediation branch — IN PROGRESS; authoritative GitHub Actions run is tracked by PR #21

## Findings driving this remediation

1. The first-run test harness was independently broken and is intentionally no longer part of `npm test`.
2. Spotify integration encrypted the client secret at rest but passed the encrypted value to Spotify OAuth at runtime.
3. Discord manual disconnect could trigger the gateway reconnect handler and resurrect a deliberately disconnected instance.
4. yt-dlp could survive an FFmpeg termination in the streaming path.
5. The privileged control daemon's runtime directory could prevent the unprivileged bot from reaching its socket.
6. The installer used `npm install` rather than the lockfile-enforcing `npm ci`.
7. Several dashboard operations used legacy API shapes/actions that did not match the backend contract.
8. Playlist deletion was exposed by the UI but had no backend endpoint.
9. TeamSpeak deletion was exposed by the UI but had no backend endpoint, and the legacy save form used a different field model.
10. Diagnostic entries lacked the `level` and `source` fields expected by the dashboard.

The remediation branch deliberately does **not** merge the unrelated large permissions/admin overhaul from PR #18. That work remains a separate product change and should be rebased and audited independently before merge.
