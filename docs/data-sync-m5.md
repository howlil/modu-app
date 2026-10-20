# M5 — Secure Device Pairing & Transactional Remote Apply

State: implemented on draft PR #3. No cloud deployment or release to end users.

## Implementation graph — `$design-thinking`

### Pairing

`New browser → non-extractable ECDSA P-256 key → one-time invitation → signed approval from existing device → register public key → signed transport`

- **A:** explicit authorized device with a distinct private signing key in its browser IndexedDB
- **E:** invalid/expired code, already consumed invite, wrong human confirmation, revoked/unpaired device, malformed public EC point, rate limit / unavailable storage
- **R:** browser WebCrypto + IndexedDB, authenticated Cloudflare Worker gateway, SQLite-backed per-space Durable Object
- **Trust:** high-entropy 32-byte invitation is a temporary capability, but NOT an API credential. Approval requires an existing device's signed request.
- **Resources:** five-minute invitation expiry, hash-only secrets, separate IP rate limiter; no bearer cookies or account sessions

Initial creation is allowed only through the rate-limited SvelteKit `POST /api/sync/initialize`. That gateway chooses an unpredictable UUID space ID and calls the private Durable Object directly. The new DO initializes with the owner's public key and SHA-256 hash of a newly generated 256-bit recovery key.

The UI shows one `spaceId.recoverySecret` recovery code once. Recovery validates the secret hash and **rotates the key atomically with authorization of the replacement device**. Already revoked or unauthorized device signatures fail. Prior downloaded local data is not remotely erased by revocation.

### Data synchronization

`User presses Sync now → Web Lock (shared with restore) → push M3 outboxes → server durable ACK → ack feature outbox → pull ordered pages → feature-owned inbound IDB transaction(data + inbox + cursor + tombstones) → refresh UI`

- **A:** all feature cursors commit through the same sequence, remote mutations persisted, pending queue only removed after acknowledged server commit
- **E:** missing key, network unavailable, quota, malformed ack, replay, schema mismatch, concurrent revision, immutable ID collision, delete/edit race, unresolved offline local change
- **R:** `SyncOutboxPort`, `SyncTransport`, SQLite journal, Web Locks, IndexedDB
- **Execution:** explicit foreground only; max 100 pages and bounded batches; no polling automation
- **Trust:** server authentication does not make payload domain-valid. Each module decodes and validates its own remote updates before committing.

Each feature's **local IndexedDB owns `sync_inbox`, `sync_tombstones`, `sync_metadata` and `sync_outbox`**.

| Module | Schema | Remote apply |
| --- | --- | --- |
| Pomodoro | v3 | immutable completed sessions, task assignment command, deletes with tombstones |
| Habit Tracker | v4 | validated initial baseline, habit/policy versions, check-in before/after commands, tombstones |
| Language Learning | v6 | validated initial backup, profile/catalog revisions, practice command via `applyPracticeCommand` and SRS memory projection |

The global coordinator does **not** open module databases. It calls the public `SyncOutboxPort` methods. Each remote module applies a full ordered journal page (including other module events) and advances its own cursor transactionally. After a partial cross-database failure, a retry fetches from the **minimum** committed module cursor; modules ahead ignore already-committed sequence IDs. This provides recoverable cross-database *eventual* consistency rather than pretending IndexedDB supports a global ACID transaction.

Unknown operations, non-matching previous state, immutable collisions, corrupt records and remote events while local unacknowledged changes exist are **fail-closed**. The UI displays a conflict/error; data is not auto-overwritten and the failed module cursor does not move.

### Initial enrollment

- Original device: feature-owned baseline read and outbox capture are one transaction per module; pairing stays pending until all feature capture ports complete.
- Inviting a new device requires the owner to have uploaded its baseline first (no pending local outbox and nonzero committed remote cursors).
- New/recovered device must download/validate the owner baseline and all remote changes before enabling capture.
- `beginRemoteSyncCapture` checks a durable **foreign baseline receipt**, successful cursor and empty outbox; it does not re-upload an entire imported baseline.
- Existing divergent local data is **not overwritten**. Backup and explicit manual reconciliation are required.

### UI

`/settings/data`: compact device label, create/join/recover selection, copyable invitation, manual six-digit cross-device comparison, device list/revoke, one-piece portable recovery code, and explicit `Sync now`. No background uploads and no false claim of server-side E2EE.

## Test gates

- `bun run check`, `bun run test`, `bun run build`
- `wrangler deploy --config wrangler.sync.jsonc --dry-run`
- Node built-in real SQLite tests for bootstrap, signed invites, approval, replay, revocation, recovery rotation, invalid P-256 key, idempotent push/pull
- fake-IndexedDB unit regressions for the module remote inbox/cursor, immutable session collisions, divergent Habits and interrupted replay
- **two isolated IndexedDB browser contexts** exchanging Pomodoro, Habit, Language Learning baseline and incremental changes, including an SRS-generating practice attempt
- Existing Chrome E2E global Data & Sync backup/restore + all six module DB schema stores

## Scope and M6 release blockers

- The feature is **not production-deployed**. Cloudflare binding, Pairing IP rate limiter and Worker must be deployed together; deploy `modu-sync` first.
- M6 must perform *real Cloudflare/Miniflare multi-browser HTTP E2E*: signed routes, DO namespace, origin validation, power loss/network retry, quota, clock skew, cross-device races, cursor compaction, and operational rollbacks.
- Operation journal is not yet compacted; each sync space can grow indefinitely. Add checkpoints and per-device cursor acknowledgements before long-term production use.
- Remote snapshots are currently bounded by 256 KiB request size; large histories need versioned chunking/checkpoints before production.
- Domain conflicts intentionally stop sync; M6 should specify an explicit per-domain user-facing resolution workflow.
- Only HTTPS and platform-at-rest encryption are offered. There is **no E2EE**; server operators can access sync payloads.
- M5 does not create an account or global identity service; authorization is by possession of non-extractable device keys or a user-held recovery secret.
- Reactivity across already-mounted module controllers after replay needs full device acceptance tests; reload may be required to refresh projections.
- The PR remains draft; do not merge/release automatically.
