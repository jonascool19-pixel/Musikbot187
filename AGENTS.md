# Codex continuity

Before changing this repository, read `.codex/work-status.md`. It is the durable handoff for work that may continue in another chat.

After every material implementation or verification step, update the handoff with:

```text
node scripts/update-work-status.mjs --status "..." --current "..." --completed "..." --next "..." --checks "..." --base "..."
```

Keep the handoff concise and factual. Never record passwords, temporary passwords, access tokens, private logs, personal data, or other secrets. Update the status before committing so GitHub always contains the latest continuation point.
