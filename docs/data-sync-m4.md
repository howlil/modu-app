# M4 — Cloudflare SQLite Sync Transport

**State:** code complete for the server journal and signed transport, **not enabled for any real device**.
PR #3 remains draft; M5 device pairing and safe remote application are still required.

## Engineering graph (`$design-thinking`)

`Authenticated browser → SvelteKit sync route → private DO binding → SyncSpace → SQLite journal`

Push `Program<AcceptedIDs, InvalidSignature | Replay | InvalidOperation | Conflict | StorageFailure, DeviceKey & DurableObject & SQLite>`
- validate `spaceId` at SvelteKit gateway and **never** use a client-selected DO script.
- stream-bound request body (256 KiB). Forward signed headers and JSON only; no cookies.
- check registration and revocation in the **per-space** SQLite database.
- ECDSA P-256 SHA-256 verify over method, pathname+query, 13-digit millisecond timestamp, fresh nonce and SHA-256 body hash.
- deserialize/validate <=50 operations, including exact authenticated device ID.
- consume the nonce and all operation inserts within one synchronous SQLite transaction.
- retry with the **same operation ID and payload but fresh nonce** returns the previously committed sequence; different payload using an existing ID fails with 409.
- only a fully committed SQLite response authorizes the future client to acknowledge M3 outbox IDs.
- operation IDs are unique per sync space; sequences are monotonically increasing **per space**.

Pull `Program<SequencedChanges, Unauthorized | Replay | InvalidCursor | StorageFailure, DeviceKey & DurableObject & SQLite>`
- authenticated, replay-protected `GET .../changes?after=N&limit=1..100`.
- SQLite `SELECT ... WHERE seq > ? ORDER BY seq ASC LIMIT ?`.
- `nextCursor` is the last returned sequence or unchanged on an empty page; `hasMore` indicates pending rows.
- client rejects non-monotonic sequences, incomplete acknowledgements, mismatched IDs, malformed events and unsupported limits.
- **Do not advance a persistent client cursor merely because a HTTP pull succeeded.**
  Application of remote changes into the owning module and replay-proof
  transactional inbox/cursor remains a separate dependency.

## API (signed device authentication required)

| Method | Path | Response |
| --- | --- | --- |
| POST | `/api/sync/spaces/:spaceId/changes` | `{accepted:[{operationId,sequence}]}` |
| GET | `/api/sync/spaces/:spaceId/changes?after=0&limit=100` | `{operations,nextCursor,hasMore}` |

There is deliberately NO public `POST /spaces`, `POST /devices` or `POST /pairing` yet.
Until a trusted M5 enrollment authority registers keys in a space's device table,
all signed requests return 401. There are no public or anonymous writes.

## SQLite tables

- `devices`: public JWK and irrevocable device revocation date
- `used_nonces`: per-device replay protection, retained beyond accepted signature window
- `operations`: immutable serialized operations, unique IDs, per-space monotonic sequence

SQL is provisioned on the first object access by the Durable Object runtime; **no D1 database or managed `.db` file is needed**.

## Deployment order (not performed by this PR)

1. `bunx wrangler deploy --config wrangler.sync.jsonc` (new `modu-sync` Worker / DO namespace).
2. `bun run deploy` (modu-app SvelteKit Worker, cross-Worker `SYNC_SPACE` binding via `script_name`).
3. M5 must add a secure pairing/enrollment flow and feature-owned transactional remote apply before enabling the UI toggle.

The isolated SQLite Durable Object class uses a **declarative `exports` namespace**.
Do not combine that lifecycle definition with a legacy `migrations` entry for the same class.

## Verification and operating limits

- `bun run check`, `bun run test`, `bun run build`
- `bunx wrangler deploy --config wrangler.sync.jsonc --dry-run`
- Node built-in SQLite integration exercises signed requests, per-space ordering,
  retry idempotency, rollback on batch failure, nonce replay, signature failures,
  revocation and malformed queries.
- Existing Chrome Habit / global backup-restore E2E stays green.
- Missing binding returns 503, missing signed credentials return 401;
  no data upload on local-only sessions.
- No automatic journal compaction until durable per-device cursors and retention
  policy are implemented (otherwise an offline device can miss events).

## Still blocked, not claimed as complete

1. **M5:** approved cryptographic pairing, recovery, key storage, registration and revocation UX.
2. **Remote apply:** per-feature transactionally committed inbox, conflict handling
   and cursor acknowledgement. Server durable acceptance does NOT mean domain state
   has been applied on another browser.
3. **M6:** real Cloudflare Miniflare/worker runtime E2E, multi-device concurrency,
   failure injection, quotas and full security review. Current Node SQLite integration
   plus Wrangler dry-run do not alone establish production readiness.
4. No E2EE; encryption is limited to HTTPS transport and Cloudflare platform storage.
