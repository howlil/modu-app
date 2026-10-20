# M3 — Durable Local Outbox & Conservative Conflict Admission

Status: implemented on `feat/global-data-sync-foundation` (draft PR #3).
Cloud push/pull, pair approval, remote replay and production rollout are **not** enabled.

## Implementation graph ($design-thinking)

`Mutation command → feature validation → IndexedDB readwrite transaction(domain stores + sync_metadata + sync_outbox) → committed local state + operation (when paired) → UI notification`

- **A:** module-owned data and, when capture is enabled, exactly one or more durable pending operations committed as a unit.
- **E:** invalid/corrupt capture configuration, blocked upgrade, quota, stale revision, invalid command. The transaction aborts, never reports success.
- **R:** browser IndexedDB and crypto UUIDs. Cloud infrastructure is not required during M3.
- **Execution:** module write transactions serialize overlapping store scopes. Remote sync ordering is deferred until M4.
- **Trust:** the future network adapter must revalidate all incoming operations; the pure conflict policy is NOT authorization.
- **Resource lifetime:** module-owned transactions/IDB connections close after settle.

## Module-owned persistence boundaries

| Module | Version | Feature-owned IDB stores | Captured local changes |
| --- | --- | --- | --- |
| Pomodoro | 2 | sessions, sync_metadata, sync_outbox | completed sessions, bulk save, task assignment, clear tombstones |
| Habit Tracker | 3 | habits, policies, checkins, preferences, sync_metadata, sync_outbox | create, title/policy edit, archive, delete tombstone, check-in commands |
| Language Learning | 5 | sessions, attempts, meta, reviews, profiles, catalogs, sync_metadata, sync_outbox | profile creation, island edit/archive/import, validated practice commits |

Each module exposes `beginSyncCapture(deviceId)`, `readPendingSyncOperations(limit)`,
and `acknowledgeSyncOperations(ids)` via `SyncOutboxPort`. No global code opens the feature databases.

## Activation and migration invariants

- Capture is **disabled by default**. Ordinary local-only writes do not accumulate unsent cloud operations.
- Initial `baseline` is read inside the feature-owned readwrite transaction that enables capture. This protects the snapshot/capture boundary **within that module**.
- New schemas are non-destructive upgrades: legacy databases and backup formats remain readable.
- Restore invalidates feature outbox entries and capture metadata **in the same module transaction**. Cloud activation later requires an explicit new baseline/merge generation.
- Pomodoro active timer and extension/browser permissions are always device-local; only committed completed-session data is captured.
- Pomodoro fallback rows must be merged or rejected before pending operations are exposed. Conflicting copies fail closed; no silent ID overwrite.
- Pending outbox rows receive monotonic local sequence IDs and unique operation IDs. Ack is idempotent and must only be invoked after a durable remote accept in M4.
- The baseline of all three modules is **not** a single cross-database atomic transaction; M5 pairing orchestration must track partial activation and rollback/disconnect safely.

## Conservative M3 conflict admission

`decideRemoteOperation()` can only return apply, duplicate, or conflict. This is a guard, not a complete remote apply mechanism. It does not perform domain writes:
- same operation ID = duplicate
- deletions racing with edit = explicit conflict
- completed focus session overwrite = immutable conflict
- unknown or mismatched base revision = conflict (including concurrent habit increments)
- matching revision with authorized feature-specific mutation may be admitted but must still be validated by the owner module

## Verification

CI runs TypeScript/Svelte check, unit tests, Cloudflare build, existing Habit Chrome E2E, and Global Data backup/restore Chrome E2E.
Targeted fake-IndexedDB regressions cover capture opt-in, non-destructive upgrades,
atomic rollback on corrupt metadata, durable sequencing and idempotent acknowledgements,
baseline from existing feature state, fallback reconciliation after temporary unavailable IDB,
cross-module restore queue invalidation, and conflict admission.

## Explicit M4/M5 dependencies

- Device authorization and authenticated sync spaces in Cloudflare SQLite Durable Objects.
- Durable remote replay/inbox + transactionally advancing sync cursor in each feature database.
- Domain-aware `applyRemoteChanges` with serialized conflict resolution and tombstones.
- Global pairing orchestration and recovery/rollback of partial multi-module enrollment.
- Resume after compaction, quota failures, schema mismatch, and offline periods.
- E2EE is not implemented; plaintext sync must not be enabled by default or advertised as private to the server.
