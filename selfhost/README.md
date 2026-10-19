# Language Learning — self-hosted persistence (M1)

Status: **storage component available; application not yet published in Modu's launcher**.

The Modu Cloudflare Worker does **not** contain a durable SQLite volume. Language practice writes go through the feature-owned same-origin HTTP adapter to a separate, **user-managed Bun + SQLite** process.

## Execution topology

- Browser → \`/api/language-learning/state\` (GET) and \`/api/language-learning/commands\` (POST), **same origin as the UI**.
- User-managed reverse proxy → loopback-only Bun persistence process.
- Bun process → user-owned SQLite file (default \`./data/language-learning.sqlite\`).
- No account, tenant, subscription, cloud sync, or hosted shared database.

This endpoint must not be exposed directly to the internet. Its lack of application login is intentional; use a private network/VPN or a separately secured reverse proxy. \`MODU_LEARNING_ORIGIN\` is an origin restriction, **not authentication**.

## Run the storage process

Requires Bun.

\`\`\`sh
MODU_LEARNING_DB=./data/language-learning.sqlite \
MODU_LEARNING_ORIGIN=https://your-private-modu.example \
bun run language:storage
\`\`\`

Configuration:
- \`MODU_LEARNING_DB\`: writable user-controlled durable volume; do not place it in ephemeral Worker storage.
- \`MODU_LEARNING_PORT\`: loopback listener port (default 8789).
- \`MODU_LEARNING_ORIGIN\`: **exact** scheme + hostname + port (if present) of the UI as seen by the browser. Default is \`http://localhost:8789\`, intended for direct local API diagnostics.

The service always binds to \`127.0.0.1\`. Keep a user-managed reverse proxy routing **the same-origin path** \`/api/language-learning/*\` to \`http://127.0.0.1:8789/api/language-learning/*\` while serving/proxying the Modu UI at the same origin. Preserve the original \`Host\` header. Do **not** configure permissive CORS or forward this port to the public internet.

**The current hosted Cloudflare Modu UI has no persistent-server route or proxy to this service.** Merely running the Bun process does not connect the live Cloudflare-hosted app. A complete single-instance deployment topology and access protection are prerequisites before publishing the launcher tile.

## Business guarantees

- Session snapshots include content revisions and per-language profile IDs.
- Commands are validated and persisted before UI state is acknowledged.
- A SQLite \`BEGIN IMMEDIATE\` transaction stores session state and the corresponding attempt row atomically.
- A globally unique attempt ID deduplicates retries and rejects reuse for different evidence.
- Per-session revisions reject lost updates from another tab.
- A delayed/lost response can be reconciled by retrying the same command/attempt ID or reloading the saved record.
- Invalid/corrupt stored data produces a visible error; it is never silently overwritten with empty progress.
- Listening, shadowing and skip attempts remain distinct from rated recall; only rated recall may affect future SRS.
- Memory scheduling, full history UI, data export/import and media generation are **not** implemented in M1.

## Verification

Run \`bun run test\` (includes Vitest and Bun SQLite integration), \`bun run check\` and \`bun run build\`.
The real-SQLite integration proves restart recovery, duplicate attempt retry, stale-write rejection and transactional rollback.

For backups of a running SQLite database, use SQLite's supported online backup procedure, or shut down the storage service cleanly before copying the database file. **Do not simply copy the WAL-mode main database while writes are in progress.** Backups/restores with UI are later product work.
