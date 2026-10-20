# M6 — Production Hardening / Release Gate Review

Status: **implementation and fault hardening on draft PR #3**. Not production-deployed or merged. Do not describe the current sync feature as production-ready until every blocker below passes.

## Security/failure graph ($design-thinking)

`User action → feature-owned local atomic outbox → signed HTTPS gateway → per-space SQLite transaction → reply validation → local ACK → incremental authenticated pull → feature-owned domain inbox + cursor commit`

Each arrow is a potential failure boundary. The only safe retry point is the last **durably committed local** or server state, never the last optimistic UI state.

| Failure / attack | Enforced behavior | Evidence |
| --- | --- | --- |
| Recovery after device theft | Rotate recovery code; revoke **all prior devices and pending invitations** in same SQLite transaction | SQLite integration recovery regression |
| Lost HTTP push response after server commit | Original operation remains in client outbox and is retried with the **same ID, new signed nonce** | Outbox fault injection + server idempotency |
| Forged/non-unique ACK or non-monotonic pull cursor | Reject without acknowledging local queue / advancing persisted cursor | Contract unit tests |
| Abrupt DO restart | SQLite journal survives; same operation retries without duplicate | Real local `workerd` integration |
| Nonce replay | Reject signed request replay; no duplicate journal mutation | SQLite/workerd tests |
| Corrupt EC point, revoked key, unauthorized client | Reject before granting device access | SQLite pairing security tests |
| Failed client IDB batch (corruption, quota, conflict) | Transaction rolls back domain writes **and** inbox receipts/cursor | fake-IndexedDB module replay tests |
| Conflicting module edits | Fail closed. No blind overwrite or last-write-wins. Explicit backup/manual resolution required | Two-browser simulations / conflict tests |
| Oversized cloud request | Streaming limit 256 KiB; preserve local outbox for future retry/backup | Signed gateway + DO body reader |
| Excessive journal growth | **64 MiB and 100,000 events maximum per sync space**. Return 507; never silently compact event history | SQLite quota rollback test |
| Oversized pull page | Bounded server response **768 KiB**, at most 8 SQL rows fetched per page; browser bounds response at **1 MiB** before JSON decoding | SQLite pagination + transport tests |
| Offline network / wrong device credentials | Stop and surface specific recovery guidance; local data remains available | Diagnostic and fault-injection tests |

## Runtime verification

New test files:
- `test/integration/sync-worker-runtime.mjs`
- `test/workers/sync-runtime-harness.ts`
- `wrangler.sync.test.jsonc` (local-test-only configuration, NEVER deploy)
- `test/unit/sync-fault-injection.test.ts`
- existing SQLite test extended with quota/remote-device-recovery regressions.

The workerd harness launches **real local Cloudflare workerd** with an isolated SQLite-backed DO namespace and temporary persistence directory; validates signed bootstrap/push/pull, unauthorized access, replay, restart persistence, and idempotent operation retry. Its temporary worker exposes test-only bootstrap routing and **does not** test the production SvelteKit gateway/rate-limit chain. It is not a hosted Cloudflare test.

CI gates: `bun run check`, `bun run test`, `bun run build`, `wrangler deploy --config wrangler.sync.jsonc --dry-run`, local workerd integration, Chrome Habit E2E, and Chrome global Data/Sync E2E.

## Operational boundaries and quotas

- Data remains **local-first**. Upload only after user opts into a sync space and clicks **Sync now**. No background upload.
- **Kill switch:** public SvelteKit enrollment/pairing/journal routes require the operator-controlled Worker environment variable `SYNC_ROLLOUT_ENABLED="true"`. It is **absent / disabled by default**. `GET /api/sync/status` exposes only a boolean; the Data & Sync UI hides cloud pairing/sync when unavailable.
- Turning the flag off never clears browser outbox, already-persisted SQLite data, or browser credentials. Do not enable on production until all release blockers below pass.
- Cloudflare Durable Object SQLite is the remote append-only authoritative journal, **not** the browser's authoritative module storage.
- New devices need explicit signed approval. Recovery grants a new device and revokes all former devices.
- Local browser private signing keys are WebCrypto non-extractable and stored in IndexedDB. They are not a substitute for encrypted sync payloads.
- The server can inspect payload content. **No end-to-end encryption (E2EE)** is implemented.
- The 64 MiB journal quota is a *fail-closed storage cap*, **not** automatic compaction. When reached, the sync space stops accepting new writes; local outboxes/backup remain available.
- The 256 KiB signed POST ceiling means large existing per-module baselines cannot currently be sent. Future chunked snapshots must be implemented **before unrestricted production rollout**.
- Cloudflare's local Wrangler runtime may support a different compatibility date from deployed Cloudflare. The test-only config uses the binary's supported date; production config remains unchanged.

## Release blockers (open)

1. **Chunked baselines and checkpointing:** versioned snapshot chunks with hashes, generation IDs, referential/domain validation and atomic activation; no partially usable generations.
2. **Safe journal retention/compaction:** acknowledgements from active devices, disconnected device expiry policy, immutable checkpoint, and offline-resume tests; never trim unseen events.
3. **Staging true cross-Worker E2E:** hosted isolated Cloudflare `modu-sync` and `modu-app` environments, real signed SvelteKit gateway and rate-limit bindings, production request origin/CSRF validation, scheduled Worker deploy order.
4. **Conflict-resolution UX:** guided per-domain export, inspected merge, manual override with explicit confirmation; no automatic last-write-wins.
5. **Live device acceptance:** pair Chrome desktop ↔ mobile Safari/Chrome, verify focus completion, Habit check-ins, Learning SRS and startup/rehydration; validate clock skew and timezones.
6. **Operational tests:** staging force network loss, token revocation mid-request, storage quota, SQLite fault injection, multi-browser simultaneous writes, schema downgrade/upgrade, storage backup and restore, privacy tests.
7. **Privacy/product decision:** explicitly accept server-readable payloads or add versioned client-side E2EE before opt-in mass rollout.

**These blockers mean M6 is a hardening milestone, not authorization to release.**

## Safe deployment checklist (future, only after gates)

- Keep the current GitHub PR in **draft** until M6 gate sign-off.
- Deploy isolated `modu-sync` staging Worker first (`bunx wrangler deploy --config wrangler.sync.jsonc` after selecting staging account/environment); validate its SQLite namespace.
- Deploy `modu-app` staging Worker bound to exactly that script with `SYNC_PAIRING_IP_LIMITER`.
- Take local backups and compare serialized data before/after staging sync; test lost-response replay and restore.
- Enable via an explicit feature flag **only for a canary cohort**, with a kill switch that stops new network operations but never deletes IndexedDB outboxes.
- On rollback, disable pairing/sync network entrypoints; retain cloud SQLite journal and device credentials; never clear client outboxes or downgrade feature IDB versions.
- Monitor sanitized status codes, operation count and storage quota without logging recovery codes, secrets, signed request bodies, or raw module history.

For any conflict or full space: use **Export all data** in global Data & Sync before manual resolution. Clearing browser site data is not an acceptable recovery procedure.
