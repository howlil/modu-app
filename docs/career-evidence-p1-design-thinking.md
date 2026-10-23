# Career Evidence — P1 Reliability Hardening ($design-thinking)

Status: proposed changes on \`fix/career-evidence-p1-design-thinking\`; **do not merge until Verify passes**.
Base: \`master@9f4f84c4e8ed3dcf8dbe3ca236b2151ee8055756\`.

This is a local implementation graph rather than a new architecture or independent sync engine.

## 1. Shapes and invariants

\`CareerMoment(id, revision)\` → \`CareerOutput(items[{momentId,sourceRevision}], revision)\`
→ \`FinalizedSnapshot(id, version, outputRevision, sections)\`.
\`PendingSyncOperation(entityId,kind,baseRevision,payload)\` persists alongside the domain change.

- **R1**: a locally committed document never points to an absent moment or a future source revision.
- **R2**: a domain mutation is committed together with its queueable sync operation in one IDB readwrite transaction.
- **R3**: no individual queued operation is larger than the signed transport body limit (256 KiB).
- **R4**: ordered outbox batches never exceed the same byte limit; only acknowledged operations are deleted.
- **R5**: snapshots are globally identified by immutable UUIDs. The historical numeric \`version\` remains a device-local ordinal. Concurrent ordinal reuse is allowed and UI disambiguates using the ID.
- **R6**: restore on a previously paired database never silently initializes a new baseline in the old cloud space.
- **R7**: saved draft and finalized snapshot contents are not rewritten to resolve sync collisions.

## 2. Program A — successful flow

\`\`\`text
Save Moment/Output
  → decode
  → validate sync operation envelope size
  → open feature IDB transaction
  → verify referenced source moments (Output writes)
  → commit domain row + conditional outbox row
  → dispatch refresh on commit
  → read pending operations
  → choose maximal prefix below byte budget
  → signed POST
  → validate server ACK IDs
  → delete acknowledged operations only
  → signed pull
  → validate remote kind/identity/refs/revisions
  → commit source/output/snapshot and cursor atomically
\`\`\`

\`\`\`text
Finalize on A and B concurrently
  → each inserts immutable snapshot with its own UUID, local version=N
  → journal orders independent snapshot upserts
  → peers accept both UUIDs, even when local version=N
  → UI shows "Version N · <id prefix>"
  → no mutation of either snapshot payload
\`\`\`

## 3. Execution semantics

- **Ordering:** source events must arrive before dependent Output events and snapshots. Cursor advances only after accepted events in the feature transaction.
- **Concurrency:** writes affecting Output/source are serialized by an IDB transaction spanning both stores; local revision compare-and-swap remains mandatory.
- **Sync processing:** preserve FIFO order; select a size-bounded prefix of at most the configured batch count. Never skip an oversized head to send later events.
- **Interruption:** cancellation before IDB transaction commit aborts domain and outbox together. Interrupted push cannot ACK without server confirmation. Replayed ACKs use existing idempotent protocol.
- **Scope:** DB handles are closed in finally. No background sync is created by this patch.

## 4. Program E — expected failures and recovery ownership

| Failure | Owner | Policy |
|---|---|---|
| Invalid or missing moment reference | Feature IDB repository | Abort write; preserve editor draft |
| Individual record exceeds transport cap | Feature preflight | Reject before commit; suggest smaller document |
| Batch exceeds transport cap | Global coordinator | Take maximal safe ordered prefix, retry tail |
| Stale output/source revision | Feature repository | Abort write; reload and review |
| Snapshot version local-ordinal collision | Snapshot identity policy | Permit distinct UUIDs, disambiguate labels |
| Duplicate snapshot UUID | Remote replay | Reject and abort cursor transaction |
| Paired-device restore diverges from journal | Feature sync generation gate | Fail closed; require export + explicit new pairing / controlled recovery |
| Corrupt remote operation | Feature inbox | Abort transaction; never advance cursor |

Existing conflict resolution for concurrent **mutable** Moment/Output edits is deliberately fail-closed; automatic merging is outside this patch. It remains a separate release risk and must be tested manually.

## 5. Program R, trust boundaries and policies

R = \`IndexedDB + Web Locks + existing SyncOutboxPort + signed transport + GitHub CI + fake-indexeddb\`.
Trust boundaries: decode backup/replay input; validate \`momentId\` and \`sourceRevision\` at the write transaction; encode bounded transport envelope.

No parallel persistence, alternate remote authority, or new server API.
No Effect dependency is introduced.

When a paired database is restored, write \`post-restore-reconciliation\` into feature metadata in the same restore transaction. \`resumeSyncCapture\` rejects this marker. Only explicit **new pairing setup** can clear the marker while creating a new baseline. This prevents a post-restore baseline from diverging peers in the old space.

Privacy: signed JSON authenticates sender/integrity; it is not end-to-end encrypted. User-facing copy explicitly describes the boundary.

## 6. Verification and review gates

- \`bun run check\` (Svelte/TypeScript).
- \`bun run test\`: bounded batches, orphan/future source references, concurrent finalized copies, post-restore sync gate.
- \`bun run build\` (Cloudflare).
- \`node test/e2e/career-evidence-browser.mjs\` (real Chrome/ChromeDriver).
- \`node test/e2e/global-data-browser.mjs\` (existing global restore and sync).
- \`node test/integration/sync-worker-runtime.mjs\` (signed Workerd transport).
- Browser fault-injection: two devices finalize same document before pulling; recovery after restoring a previously paired browser; oversize operation rejection.
- **NO-GO** until concrete green CI and browser evidence is collected. This document does not claim tests were executed.

## 7. Reverse-graph review

Check every graph node maps to a domain/helper/repository/transport function; no UI component directly accesses IndexedDB; no network call occurs inside an IDB transaction; no data is overwritten to "resolve" a conflict. Remaining risks: mutable-edit conflict UX, large historic baselines, full production recovery generation management, actual printed PDF validation, and the long workspace controller.
