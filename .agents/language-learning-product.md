# Language Learning — Product Research State (Modu)

> Status: **M0 pure practice kernel staged; not launchable, not durable**  
> Saved: **2026-10-20**  
> Product: new independent app/module inside `howlil/modu-app`  
> Reference: HyperLingua learning methodology, **not** its codebase or commercial tier model  
> Next requested phase: detailed per-domain implementation graph via the user's saved `$design-thinking` skill. **Do not implement features from this document until explicitly requested.**

## 1. Source of truth and interpretation

This is the durable state checkpoint for the requested language-learning feature. It preserves the research and decisions across conversations; it is **not** a claim that any of these features already exist in Modu.

Read in this order before planning implementation:
1. `AGENTS.md`
2. `.agents/architecture.md`
3. `DESIGN.md`
4. This product-state document
5. Actual module code and tests at the time of implementation

If current repository code contradicts a proposal below, inspect and resolve the discrepancy explicitly. Do not silently rewrite existing modules to fit the proposal.

### Verified from current Modu repository (master, 2026-10-20)

- Stack: Svelte 5, SvelteKit 3, TypeScript, Bun, Tailwind CSS v4, shadcn-svelte, Cloudflare Workers Builds/adapter.
- Modu is presently **local-first browser utilities**. There is **no existing self-hosted server persistence architecture** for learning data.
- Existing implemented modules include `pomodoro` and `habit-tracker`. Typing Practice, Image Compress and Merge PDF were removed on 2026-10-20.
- Actual registry: `src/lib/platform/registry/modules.ts` with `file-transform | focus` layouts; do not add a language-learning tile yet.
- Mandatory implemented module layout: one `<Feature>Workspace.svelte` at module root, with `core/` (pure behavior), `adapters/` (browser/provider/storage integration), `controller/` (per-mounted Svelte 5 state factory), and `components/` (feature UI).
- Routes must remain thin; do not import other modules' private code. No app-wide plugin framework or speculative abstraction.
- Pomodoro activity history uses an IndexedDB-backed focus-session repository; Habit Tracker has its own local persistence. Existing persistence demonstrates local-first patterns but **does not provide an appropriate durable multi-record transaction design for this new learning domain**.
- Tests include `test/unit/architecture-boundaries.test.ts`, which enforces the canonical folder layout/import rules on future modules.
- Existing `AGENTS.md` says work on `master` unless the user specifically requests a branch; this state file alone must not create a route/module.

### Verified learning-product reference

HyperLingua publicly describes **vocabulary associations → listening/shadowing → active recall → repeated review** with topic-based **Language Islands** and custom materials. Its paid tiers, accounts and community features are **not** part of this requested product. The exact original HyperLingua code architecture and internal scheduling algorithm are not publicly established.

Sources:
- https://hyperlingua.app/method/
- https://hyperlingua.app/method/active-recall/
- https://hyperlingua.app/method/shadowing/
- https://hyperlingua.app/method/language-islands/
- FSRS **candidate, not confirmed HyperLingua technology**: https://github.com/open-spaced-repetition/ts-fsrs

## 2. Fixed product decisions (user-authorized)

| ID | Decision |
| --- | --- |
| SYS-01 | New Language Learning app is part of **Modu**, not a new independent repo. |
| SYS-02 | One personal learner per deployment/instance; not multi-tenant. |
| SYS-03 | **No application login, account, user-role hierarchy, tenant, subscription, paywall, or entitlement checks.** |
| SYS-04 | All learning capabilities are available under the same rules. |
| SYS-05 | One learner can study multiple target languages; memory/progress is isolated **by learning-language profile**, not by user ID. |
| SYS-06 | User owns data; durable persistence/backup is to be handled through **user-controlled self-hosting**. Exact storage and deployment topology is pending research and decision (§7). |
| SYS-07 | Core study must work **without AI keys**; AI translation, content generation and TTS are optional integrations. |
| SYS-08 | Manual content creation, modification, import/export, backup and restore belong to the eventual product contract. |
| SYS-09 | No shared social content network, leaderboards, provider account sync, or monetization logic in core. |
| SYS-10 | Every learning attempt is idempotent and recoverable; learning evidence must not be inflated by playback/skip. |
| SYS-11 | Existing Modu modules, registry, UI styles, deployment and storage keys must remain unaffected during this **research-only** milestone. |
| SYS-12 | No implementation or UI changes until the user explicitly requests the next milestone. |

## 3. Product job and observable loop

**Actor:** one personal learner operating a self-controlled Modu installation.

**Trigger:** wants to learn practical sentences and vocabulary in a chosen language without assembling a complete course manually.

**Job:** turn passive recognition into usable, repeatable recall and speech practice while retaining learning history across sessions.

**Primary behavior:** `Choose Language → Discover/Create Language Island → Understand Vocabulary & Sentences → Listen/Shadow → Recall → Reveal & Evaluate → Commit Attempt → Schedule Review → Return Later`.

**Proof:** without signing in or configuring a paid service, a learner can complete a recall practice session, close/reopen, view correct prior evidence, and later review an appropriately scheduled item.

**Important distinction:** recognizing a word, listening to audio, and speaking along with audio are not the same as successful unaided recall. A practice event must declare its evidence type.

## 4. Planned domain / engine boundaries (logical, NOT microservices)

A *domain* owns behavior/data invariants. A named *engine* is logic in that domain. These are not one folder, route, service, database, or UI page per engine.

| Domain | Owns | Critical requirements | Expected behavior graph | Priority |
| --- | --- | --- | --- | --- |
| **Learning orchestration** | Active language profile, learner goals/preferences, recommended plan | LE-01..07: many languages, due/weak/new ranking, manual override, resume, replan without rewriting evidence | `Load profile → due/weak/new candidates → plan → learner selects → practice → refresh plan` | Core |
| **Content & curriculum** | Built-in collection, Language Island, Sentence revision/provenance, language and accepted variants | CT-01..07: catalog, topic collection, variants, revisions, favorites, archive | `Browse → Island → Sentence snapshot → Start practice` | Core |
| **Vocabulary acquisition** | Lexical item, meaning/context/example/mnemonic, linkage to sentences | VO-01..06: vocabulary discovery, exposure vs recall, cross-sentence references | `Introduce → Context → Listen → Hide → Recall → Review evidence` | Core |
| **Practice session** | Session lifecycle, item navigation, attempts and durable completion | PR-01..09: start, mode, pause/resume, crash recovery, unique attempt, skip, session snapshot | `Created → Active ↔ Paused → Completed/Abandoned`; interruption recoverable | Core |
| **Recall & evaluation** | Evidence classification, reveal, self-rating, challenge grading, accepted alternatives | EV-01..07: self-rated vs objectively scored vs AI-assisted; only eligible evidence updates memory | `Prompt → Attempt → Reveal → Evaluate → Commit → eligible SRS update` | Core |
| **Memory & review** | Memory state, review logs, scheduler config/version, due queue | SR-01..09: due, learning/relearning, suspend, reschedule, idempotency, rebuildability | `Committed eligible attempt → transition memory → next due → planner` | Core |
| **Audio & shadowing** | Playback/repeat/speed/pause/voice policy, audio availability | AU-01..08: spoken reference, controllable playback, graceful text-only fallback | `Load media → Listen → Shadow/repeat → Complete exposure` | Core |
| **Content authoring & processing** | Manual/imported drafts, normalization, preview, dedup, optional translation/TTS jobs | CG-01..10: manual-first, partial job recovery, revision and import safety | `Draft → Validate → Preview → Save → optional job → Ready/Partial/Failed` | Core |
| **Progress/history** | Rebuildable summaries and learner-visible metrics derived from durable evidence | PG-01..08: per-language history, due/attempt stats, honesty about exposure/mastery | `History → Project aggregate → Learning Home` | Core |
| **Configuration** | Per-instance and language-specific learning/media/provider preferences | provider optional, prevent unexpected network use | `Edit preferences → validate → apply` | Supporting |
| **Persistence/recovery** | Contract for durable content, attempts, review state, media references, export/restore | PS-01..09: schema version, transactional or recoverable commit, migration, backup, error visibility | `Validate → persist → confirm`; failures never misrepresented as success | Supporting but required from first functional slice |
| **Assessment** | Transfer tasks measuring skills beyond memorized items | AS-01..05: diagnostic, skill-specific evidence, uncertainty | `Unseen task → response → assessment → feedback` | Later |
| **Engagement** | Optional goals, reminders, badges | must not contaminate ability/memory measurements | `Activity → optional goal feedback` | Later |

Scope reduction: **Focus Mode is a practice presentation variant**, not a new core engine; **Challenge is an evaluation/practice mode**; **Custom Batch** is practice selection; **Favorites** is a content reference. No premature separate module for each.

## 5. Cross-domain invariants (non-negotiable)

1. One instance = one learner scope, but many languages; there is no `user_id` or `tenant_id` requirement.
2. Due queues and learning progress are isolated by language profile.
3. Playback, exposure, shadowing, skipped items, and reveal do **not** automatically count as successful recall.
4. An attempt ID is committed at most once, even on double-click, reload, timeout, or retry.
5. Only explicitly eligible evaluated recall evidence updates SRS.
6. Editing/archiving a sentence does not silently mutate old attempts or change the meaning of memory records. A session uses a stable content revision.
7. Progress is a projection of actual activity; it is not a replacement source of truth for attempts or SRS.
8. No AI or TTS provider may be required for manual sentence authoring and text recall.
9. Storage failure must remain visible and must not be converted into a successful save.
10. Restart, recovery, export and restore must preserve committed history and memory links.
11. Untrusted imports and provider responses must be validated before creating domain records.
12. No subscription, account or privilege branch is allowed in a core learning behavior path.
13. Self-hosted, unauthenticated access must not be presumed safe on public networks: deployment/network access policy is a separate trust boundary.

## 6. Modu integration fit (investigation outcome)

**Intended placement once authorized:**

```text
src/routes/<to-be-decided>/+page.svelte                  # thin route only
src/lib/modules/<feature-name>/                          # new independent app
  <Feature>Workspace.svelte
  core/                 # all pure learning/content/practice/FSRS rules
  adapters/             # persistence/AI/TTS/audio/import integrations
  controller/           # per-mounted Svelte 5 state/orchestration
  components/           # module-specific UI
src/lib/platform/registry/modules.ts                       # add only when app is launchable
test/unit/<feature>/                                       # deterministic and boundary tests
```

Use the current `focus` layout **only if** it proves appropriate for this app; do not invent new registry layouts just for naming. Reuse generic shadcn-svelte primitives and existing typography/spacing tokens. No private imports from other feature modules; if a future actual cross-feature capability is needed, agree on an explicit shared ownership boundary. Existing modules must keep behavior/storage backward compatible.

**Deployment tension:** Modu currently runs as a Cloudflare-hosted, browser-local-first utility suite. “Persistent state handled by self-hosted user” is **not yet represented by an existing storage adapter**. Options to evaluate in the next engineering-design phase, without prejudging the answer:

- A: user-owned self-hosted instance of the whole web app + its durable storage;
- B: Modu hosted frontend connecting to an explicitly configured **per-user self-hosted storage endpoint** (requires networking/authentication boundary even though the language app has no account UI);
- C: browser-local-first with user-controlled exports/backups to self-hosted storage (not equivalent to always-on self-hosted database synchronization).

Do **not** choose SQLite/D1/IndexedDB/OPFS or a server API prematurely. Decide single-instance deployment topology, offline requirements, backup semantics, connection security, transaction guarantees, and portability first. For now, keep domain logic storage-agnostic and preserve the user-owned durability requirement.

**Existing adaptive Typing Practice is not language learning.** Reuse approach (pure calculations + controller + persistence adapter), not typing-specific mastery thresholds or retention structures.

## 7. Unresolved decisions; do not silently convert into requirements

| Topic | Decision needed before implementation |
| --- | --- |
| Hosting/storage topology | Does each user self-host the entire Modu instance, only a persistence service, or a backup target? |
| Internet/offline scope | Must every practice interaction work with network disconnected, or only text/material already cached? |
| Content seed | Which initial target/source languages and licensed starter corpus are shipped? No scraping copyrighted lesson corpus. |
| Review scheduler | Assess `ts-fsrs` and its version/bundle/runtime fit vs a simpler explicitly versioned scheduler; HyperLingua's internal algorithm is **unknown**. |
| Evaluation | Active Recall default self-rating; what exact challenge types need deterministic validation? |
| External integrations | Are AI/TTS providers BYOK, local models, or optionally hosted user endpoints? Privacy, retention and failure policies vary. |
| Audio assets | Built-in licensed/reference audio, browser speech synthesis, TTS generation/caching or combination? |
| Data model/versioning | Content identity and revision strategy, review unit granularity, backup format and migration strategy. |
| UI naming/navigation | Module name, route and compact surfaces; keep consistent with Modu's existing shell/design. |
| Deployment security | No app login is allowed; if remotely reachable, define VPN/reverse-proxy/external access protection rather than exposing an open write API. |

## 8. Future per-domain `$design-thinking` planning contract — NOT executed yet

When asked to plan a domain, load the **saved custom** `$design-thinking` skill and inspect latest repo code. Supply the product contract plus an engineering-design decision for ownership before specifying code. For each domain use:

1. **Domain ownership and aggregate state** (records/IDs/variants, invariants, commands/events).
2. **A: success graph** (inputs, outputs, state changes, and exact cross-domain handoffs).
3. **Execution semantics** (one vs many, ordering, concurrency, idempotency, cancellation).
4. **E/failure graph** (validation, storage failure, provider errors, defects, interruption, recovery owner).
5. **R/contextual capabilities** (clock, scheduler, persistence, audio/media, optional provider adapters).
6. **Ingress/egress boundary** (import/provider validation, serialization and schema evolution).
7. **Runtime policies** (retry/timeout/cache/resource bounds and cleanup lifetimes).
8. **Smallest faithful proof** (unit/property/real-storage concurrency/restore/end-to-end as applicable).
9. **Proposed actual Modu file owners and dependencies** (not one folder per domain).
10. **Implementation milestone acceptance** (observable learner result).

Recommended order for future engineering design:
`Storage topology decision + Content/Profile → Practice + Attempt durability → Evaluation → Memory/SRS + planner → Audio → Authoring/import → Progress/backup/recovery → Optional challenge/assessment.`

This order is not an implementation authorization. Do not generate scaffolds/registry tiles/routes until the user says to implement.

## 9. Critical acceptance traces

- Fresh install, no account/no API key → choose language, open starter content, practice with text.
- Active Recall → reveal → `Again/Hard/Good/Easy` (or approved equivalent) → only one durable attempt and one scheduler update.
- Listening ten times → zero successful recall updates unless a distinct eligible recall attempt occurs.
- Skip five items → no manufactured failure ratings.
- Crash after seven completed items → seven committed attempts survive; session can resume.
- Two tabs retry same attempt → one committed evaluation, with recoverable conflict handling.
- Switch two target languages → independent due items, progress and preferences.
- Edit a practiced sentence → stable historical meaning and explicit revision semantics.
- TTS/AI unavailable → manual authoring and text practice still work.
- Import with partial media errors → valid materials remain usable; failed items retriable.
- Storage unavailable → never display falsely saved progress.
- Backup/restore/restart → preserves consistent content/attempt/memory links.

## 10. State checkpoint / continuation guide

**Completed in this request:** public learning-method reconfirmation; inspected actual Modu `master` repository constraints, registry, layout, existing persistence and architecture tests; captured compatible product/domain state.

**Not completed:** no application files, UI, routes, registry changes, schema, adapters, migrations, tests, CI runs, or releases. No detailed implementation plan committed yet.

**Next user-triggered phase:** first settle the self-hosted persistence topology (product/engineering contract), then produce a detailed **per-domain** implementation graph using `$design-thinking`; implement only explicitly requested milestone(s). Keep this file current when a confirmed material product decision changes.

## Implementation checkpoint — 2026-10-20

- **M0 committed on master:** `src/lib/modules/language-learning/core/learning.ts` provides validated Island/sentence snapshots; typed recall/exposure/skip evidence; pure practice session transitions (start, reveal, pause, resume, commit, abandon); duplicate attempt-id protection within a session; and summary selectors. Unit tests: `test/unit/language-learning-kernel.test.ts`.
- Workspace/controller/component are **unrouted pre-launch harnesses** to satisfy Modu's mandatory feature layout. No registry tile, production screen, server persistence, SRS, actual audio or custom-content pipeline is active.
- **Durability not implemented:** controller demo is ephemeral. Never treat completion as persisted. Self-hosted deployment/storage topology and atomic attempt/review commit remain a blocking architectural decision before releasing this module.
- **Next vertical slice:** choose a secure per-instance self-hosted persistence topology and implement a durable repository/transaction contract, then attach real practice UI; only then add review scheduling and content authoring. Keep core independent of I/O and rating/exposure semantics unchanged.
- **Verification:** new unit tests committed, but check/build/test results must be confirmed from GitHub Actions; a queued run is not a passing run.

## M1 checkpoint — self-hosted persistence and recovery (2026-10-20)

**M1 implemented on master. Storage is not published through the current Cloudflare frontend.**

### Selected topology

- User-managed Bun + SQLite service, loopback-bound, with a same-origin user-managed reverse proxy; the Cloudflare Worker has no durable SQLite disk.
- No application account, tenant, subscription or silent browser storage fallback. The owner controls service lifecycle, secure access, disk and backup.
- The service MUST NOT be exposed directly to the public internet. See `selfhost/README.md` for deployment prerequisites.

### Code and business guarantees

- `core/persistence.ts`: versioned record and commands, untrusted ingress validation, replay-safe practice transitions.
- `adapters/persistence.ts`: same-origin transport, explicit errors, no false saved state.
- `controller/language-learning.svelte.ts`: hydration, acknowledged saves, retry/reload and revision conflict behavior.
- `selfhost/language-learning-storage.ts`: SQLite WAL, FULL sync, BEGIN IMMEDIATE, session revisions, globally unique attempt IDs and atomic attempt/session writes.
- `selfhost/language-learning-server.ts`: Bun localhost HTTP entrypoint, exact origin checks, no permissive CORS; networking authority must be enforced by deployment.
- `test/unit/language-learning-persistence.test.ts` and `selfhost/verify-language-learning.ts`: decoding, command retry, revision conflict, real SQLite restart recovery and transactional rollback.
- Existing Verify remains strict with `bun install --frozen-lockfile`; the lockfile was regenerated after parallel Modu dependency cleanup.

### Remaining product and deployment gates

- No public route or launcher tile yet, and no live self-hosted reverse proxy was configured in this milestone.
- The hosted Cloudflare UI cannot transparently access the owner's loopback service; same-origin private deployment/proxy must be designed and tested.
- SRS scheduling, learning profiles UI, real content authoring, full history and export/restore are later milestones.
- Next milestone M2: Recall and Evaluation contracts backed by M1 durable attempt state; then M3 SRS.

## M2 checkpoint — Recall & Evaluation Engine (2026-10-20)

**Scope:** inside existing language-learning module; no launcher, login, multi-tenancy, scheduler or deployed self-hosted instance.

### X → A / E / R implementation graph

- **A success:** prompt → optional ephemeral written response → persisted reveal → conservative literal comparison against reference/explicit accepted variants → learner self-rating → domain-derived v1 assessment → persisted attempt (M1 transaction) → future SRS consumer.
- **E expected failures:** malformed rating rejected by core; external forged assessment dropped during command decode; mismatched durable assessment rejected on record decode; concurrent revision conflict, uncertain network result and missing self-hosted service retain M1 recovery behavior.
- **R/context:** no AI, model, network or clock used by pure evaluation; existing controller supplies pending-state, client draft and M1 repository. No new service dependencies.
- **Execution:** comparison one-shot, does not commit or rate; only a revealed recall answer is eligible to commit the learner's rating; one attempt ID remains idempotent.
- **Trust boundary:** client may supply a rating but cannot author the persisted assessment. Assessment is derived after domain validation. Text comparison is an advisory exact/variant match, never a comprehensive translation grade.
- **Recovery/legacy:** v1 assessment is optional in serialized historic attempts; `assessmentForAttempt` reconstructs v1 meaning for old M0/M1 records, while new committed records contain versioned metadata. Persisted mismatched metadata is corruption, not silently corrected.

### Files

- `src/lib/modules/language-learning/core/evaluation.ts`: `assessRecallRating`, `assessmentForAttempt`, `recallFeedback`, `checkRecallAnswer`, and assessment validation.
- `core/learning.ts`: attaches server-side derived assessment to newly committed rated recalls, preserves separate exposure/skip evidence.
- `core/persistence.ts`: guards restored evaluation metadata and continues decoding old records.
- `controller/language-learning.svelte.ts` + `components/PracticeView.svelte`: optional local-only answer draft; evaluation feedback after reveal and independent self-rating.
- `test/unit/language-learning-evaluation.test.ts`: rating meaning, SRS eligibility, conservative comparisons, accepted variant, legacy compatibility, forged metadata, retry.
- `selfhost/verify-language-learning.ts`: asserts versioned assessment survives real SQLite close/reopen.

### Explicit limits / next

- UI written answers are **not stored** in SQLite. Literal comparisons are not correctness certificates: valid paraphrases/dialects may yield `needs_review`. No automatic FSRS grade derives from text matching.
- M1 deployment limitation persists: hosted Cloudflare UI does not connect to an owner-managed loopback database by default; the language app remains unrouted.
- **Next milestone M3:** Memory/SRS: versioned review-state model, exactly-once consumption of committed eligible recall attempts, due ordering, deterministic scheduler clock and transaction coupling in the self-hosted persistence owner.

## M2 remediation and persistence re-evaluation — 2026-10-20

### Code review remediation

- M2 evaluator now returns an advisory `needs_review` result instead of throwing during reactive rendering for oversized legacy sentence text. Historical M0/M1 Islands remain readable.
- Reveal view retains a read-only copy of the learner's written answer alongside the reference, so the user can compare before self-rating. The draft is not uploaded to the database.
- Draft lifetime is keyed by session ID, cursor, sentence ID and revision; reveal/pause/resume preserves the matching draft; new session, different question or ended session clears it.
- Unit regression coverage: `test/unit/language-learning-evaluation.test.ts`. Review remediation CI: https://github.com/howlil/modu-app/actions/runs/39337992205 (all steps passed).

### IndexedDB versus SQLite: architecture decision remains open

- **Product contract:** single learner per self-hosted installation; no account or multi-tenancy, languages isolated; user controls the persistence environment.
- **Current implementation:** M1 uses a loopback Bun + SQLite storage process reached through a secure same-origin reverse proxy; this is suitable when **the installation/server** must own the canonical database, multiple browsers need one history, or server-managed backups matter. The currently deployed Cloudflare Worker does **not** connect to this storage process.
- **Recommended default for a browser-local Modu module:** IndexedDB accessed directly by the browser, transactionally storing sessions and immutable attempts; this follows Modu local-first patterns and needs no server or CORS/proxy. It is **not** equivalent to a server-instance-owned canonical database: each browser profile and origin has its own data; browsers can erase site storage; private-mode data is ephemeral; no automatic cross-device sync.
- IndexedDB supports readwrite transactions spanning multiple object stores. Reproduce existing M1 CAS revision checks, stable attempt-id uniqueness, transaction-complete acknowledgement, old record decode, migration/recovery tests and language isolation before replacing the SQLite adapter. Avoid network/await operations inside an open IndexedDB transaction that could auto-close.
- Protection for a browser-local MVP: optionally request `navigator.storage.persist()` (grant is not guaranteed), show persistence/quota status, provide an explicit versioned export/import and automatic or user-initiated backup workflow, handle quota errors, blocked upgrades and multi-tab conflict. Never claim that IndexedDB alone provides permanent or instance-wide backups.
- **No persistence adapter migration has been performed by this research step**. Do not remove SQLite, introduce dual synchronization, or change the Cloudflare deployment as if the choice were finalized. Decide whether authoritative storage is per browser or per self-hosted installation before M3, because scheduling needs one clear canonical journal and transaction owner.

References: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB ; https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist ; https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction ; https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Basic_Terminology .

## M1 refactor checkpoint — IndexedDB primary storage (2026-10-20)

**Current architecture decision (supersedes M1 SQLite plan above):** one browser profile + one origin owns one learner's language-learning database; no Bun persistence server, backend login, multi-tenant DB, or dual-write. The language-learning module remains unregistered/unrouted pending later product milestones.

### Implementation graph: A / E / R

- **A (success):** controller sends `PracticeCommand` → `adapters/persistence.ts` opens browser IndexedDB → one strict-durability readwrite transaction reads session and checks revision/attempt ID → applies pure `core/persistence.ts` state transition → writes session, globally unique attempt, and latest-session pointer → controller receives saved state **only on transaction.oncomplete**.
- **E (failures):** `conflict`, `invalid`, `corrupt`, `quota`, `blocked`, `unavailable`; failed transaction aborts without acknowledging changes. Duplicate attempt ID retries are idempotent within an existing session; cross-session duplicate IDs are rejected. Corrupt records never silently become empty history. Browser storage permission is best-effort, not a permanent backup.
- **R (capabilities):** native browser IndexedDB and optional StorageManager; no backend/database service, no network request and no new UI storage framework. Browser connections are opened per operation and closed on commit/abort/versionchange.
- **Execution:** transactions synchronously enqueue requests; no awaits inside an active IDB transaction. `readwrite` serializes overlapping writers and enforces revision CAS within that transaction.

### Schema v2, backup and recovery

- `sessions` object store: `{id, updatedAt, record: StoredPractice}` with `updatedAt` index. Existing `StoredPractice` v1 schema remains unchanged.
- `attempts` object store: immutable `PracticeAttempt` keyed by globally unique ID, committed in the same readwrite transaction as the session.
- `meta` object store: atomically updated pointer to latest session (avoids equal-millisecond timestamp collisions) and non-exported storage generation. Restore rotates the generation, and the controller supplies its last observed generation so stale tabs cannot mutate a restored database even when a session revision coincidentally matches; schema v1 fallback uses timestamp index.
- Backup is JSON `{format:'modu-language-learning', version:1, exportedAt, sessions, latestSessionId}`; explicit export/import actions on `LanguageLearningWorkspace.svelte`. All backup records are validated before destructive work. Import clears/rebuilds stores **atomically** in one transaction and preserves the latest-session pointer; malformed or duplicate attempts cannot partially wipe progress. Size limit 256 MiB **of UTF-8 file bytes** is applied symmetrically to export and import, including non-ASCII language materials.
- Optional `navigator.storage.persist()` request plus explicit user message: browser data may still disappear if site data is cleared, profile changes, or device fails. Exported backups are required for dependable recovery; importing into another origin/browser is manual.
- Tests: `test/unit/language-learning-indexeddb.test.ts` with fake-indexeddb (atomic commit, retry, cross-session uniqueness, concurrent writers, schema upgrade, latest-session pointer, Unicode backup round-trip, backup rollback and stale-tab restore fence) and existing M0/M2 domain tests. CI still runs `bun install --frozen-lockfile`, `bun run check`, `bun run test`, `bun run build`. Browser-native E2E remains a separate acceptance requirement.

### Removed implementation and migration boundary

- Removed `selfhost/language-learning-server.ts`, `selfhost/language-learning-storage.ts`, `selfhost/verify-language-learning.ts`, `selfhost/README.md`, `language:storage` script, and SQLite-specific CI testing. No runtime SQLite path or silent network fallback remains.
- **Important:** the refactor does not delete an external SQLite database that may exist in a user's environment, but it also does not automatically migrate its contents to IndexedDB. The previous pre-launch storage sidecar was not wired to the live Modu UI; an owner with actual SQLite data must retain that file and perform a deliberate conversion/export before retiring it. Do not imply automatic cross-device migration.
- Next M3 SRS must use this **single** IDB repository as canonical transaction owner, adding review state to the same readwrite transaction as the rated attempt. Exposure and skip do not update memory.

Latest verified M1 refactor CI: https://github.com/howlil/modu-app/actions/runs/39340683207 (frozen install, typecheck, unit tests, build passed). No production browser E2E or live module activation is implied.

## M3 checkpoint — Memory & SRS Engine (2026-10-20)

**Implemented on master; module remains unrouted/unpublished.** M3 is a deterministic, versioned SRS heuristic, NOT FSRS. An FSRS model/library would require a separate explicit algorithm migration. Reference: https://github.com/open-spaced-repetition/ts-fsrs

### `$design-thinking` graph (Shapes / A / E / R / Execution / Recovery)

- **Shapes:** MemoryState v1 (key, profileId, islandId, sentenceId, sentenceRevision, stage, dueAt, lastReviewedAt, intervalMs, repetitions, lapses, lastAttemptId, algorithmVersion). Profile + Island + sentence ID + revision form the review identity.
- **A:** validated rated PracticeAttempt -> pure M2 commitPracticeAttempt -> load existing memory -> scheduleRatedAttempt -> write session + globally unique attempt + memory + latest-session pointer + storage generation -> IndexedDB transaction completion -> UI confirmation. Replayed attempt ID returns existing state with no second scheduling update.
- **E:** stale revision/generation, globally duplicated attempt ID, corrupt saved memory, invalid scheduling input, blocked schema upgrade, quota, or transaction abort fail atomically and retain prior history. Corrupt historical states are never reset silently.
- **R:** native IndexedDB v3 reviews object store with compound index [profileId,dueAt]; existing per-mounted controller; clock as function argument. No separate server, account, new SRS dependency, Effect library or background scheduler.
- **Execution:** overlapping writers serialize in one readwrite transaction; callbacks enqueue all IndexedDB requests without awaits. Due list includes eligible scheduled states for exactly one language profile, sorted by dueAt, capped by supplied limit.
- **Historical bootstrap:** non-destructive IndexedDB v2->v3 schema upgrade; first run replays prior rated attempts from all stored sessions under an atomic, idempotent migration marker. Listening/Shadowing/Skip never create memory state.
- **Backup:** old backup JSON version 1 accepted by rebuilding rated-memory state; new backup JSON version 2 exports exact memory state alongside sessions and restores atomically. Import validates each memory record, unique keys, and matching eligible source attempt. Restore rotates storage generation so stale tabs cannot write into the restored database.
- **SRS v1 intervals:** Again 10 minutes (first learning, later relearning), Hard 1 day, Good 3 days, Easy 7 days initially. Subsequent Hard/Good/Easy use at least their initial interval and scale prior interval by 1.2/2.5/3.5, capped at 365 days. Again resets successful repetitions; lapses increment only when an already learned review item is forgotten, never for the initial learning failure or repeated Again during relearning. Ratings are not inferred from literal text comparison.
- **Clock policy:** lastReviewedAt is nondecreasing if the browser clock moves backwards. Deterministic chronological legacy replay uses code-point ID ordering for tied timestamps (not locale-specific collation).
- **Content revision:** editing a sentence with a new revision generates independent memory. M4/M5 must exclude old revisions from presented due queues when authoritative current content is known.

### Code and verification

- Core: src/lib/modules/language-learning/core/memory.ts
- IndexedDB transaction, bootstrap, due query and backup: src/lib/modules/language-learning/adapters/persistence.ts
- Tests: test/unit/language-learning-memory.test.ts and test/unit/language-learning-indexeddb.test.ts (fake-indexeddb).
- Browser-native E2E and product UI registration remain pending. No FSRS parameter optimization or cross-device synchronization is implemented.
- Next M4: Learning Orchestration combining due queue with current content/new sentences; do not schedule until user says next.

## M4 checkpoint — Learning Orchestration (2026-10-20)

**Implemented on master as a prelaunch vertical slice; Language Learning is still not registered/routed in the Modu launcher.** This milestone consumes M3 review state and the current, explicitly provided Island catalog; it does not add a content persistence engine, notification scheduler, AI provider or user account.

### `$design-thinking` implementation graph

- **Shapes:** `LearningProfile` (opaque `id` + `targetLanguage`), current `LanguageIsland[]`, validated `MemoryState[]`, explicit clock + limits (`maxItems`, `maxNew`), `LearningPlan` v1, and `LearningTask` (`relearning | review | new` with current sentence revision). No new persisted business state.
- **A (success):** validate one profile/canonical current catalog -> read consistent IndexedDB `reviews` snapshot scoped to profile -> join memory by `profileId + islandId + sentenceId + revision` -> classify: due relearning first, due review second, not-yet-recalled content third -> bound the recommendation -> select a contiguous same-Island prefix -> create M0 practice session with only selected sentences -> rated attempts flow back through existing M1/M2/M3 transaction -> refresh plan after a confirmed write.
- **Policy:** never review future-due items early; max 50 recommendation items, default UI 10, default 3 not-yet-recalled sentence slots. Due items are not crowded out by new content. Sort due items by priority then due date then stable ID tie-break; new content follows catalog order. A skip/exposure does not become memory evidence, so 'new' means *not yet recalled*, not necessarily never displayed.
- **Single-Island invariant:** M0 sessions belong to exactly one Island. The first recommended item chooses the Island; only the **contiguous** leading tasks from that Island are batched. A later new item from that Island cannot jump ahead of an earlier due item from another Island. A new current content revision is distinct from retired review evidence.
- **E (failures):** reject invalid profile, mixed target languages, duplicate Island/sentence IDs, invalid clock/limits, corrupt or duplicated memory, and plan referencing missing/edited content. Failed read/validation produces plan error; it never advances SRS or falsely persists a practice attempt.
- **R / execution:** existing IndexedDB `reviews` store and indexed `[profileId,dueAt]` read-only snapshot; controller uses an explicit `Date.now()` argument to the pure planner and no background timer or external provider. Recommendations are advisory (not a transactionally reserved queue); starting a session refreshes the plan from current IndexedDB before issuing the M1 start command.
- **Scope:** one current starter Island in the prelaunch UI; core supports many Islands and target-language profiles. M5 content authoring will own durable material catalogs and profile selection; M4 does not fabricate missing courses or migrate historical content.

### Concrete code and verification

- `src/lib/modules/language-learning/core/orchestration.ts`: validation, classification, ordering, bounded recommendation, and same-Island batch projection.
- `src/lib/modules/language-learning/adapters/persistence.ts`: `learningPersistence.plan()` loads a single profile-wide IndexedDB read snapshot; retired memory revisions are filtered against current Island content in the pure core.
- `src/lib/modules/language-learning/controller/language-learning.svelte.ts`: `refreshPlan()` and `startRecommended()`; automatic refresh after durable practice writes. Existing practice commands keep their attempt/revision/epoch semantics.
- `src/lib/modules/language-learning/LanguageLearningWorkspace.svelte` and `components/PracticeView.svelte`: minimal prelaunch recommendation surface and accurate browser-storage wording.
- `test/unit/language-learning-orchestration.test.ts` and `test/unit/language-learning-orchestration-indexeddb.test.ts`: priority, stale revision exclusion, due cutoff, profile isolation, deterministic limits, mixed catalog failure, no mutation on plan reads, and single-Island batch projection.

### Review and launch boundaries

- `$code-review` remedied a recommendation-order bug: a noncontiguous batch previously could pull a new same-Island sentence ahead of due items from another Island; contiguous-prefix batching preserves global due-first policy.
- A manual refresh is available when caught up; open tabs do not run background due timers. True browser-native E2E, production launch, persistent content authoring, and multi-language profile selection remain separate acceptance/milestone work.
- Next M5: Vocabulary & Content (current catalog source-of-truth, authoring/import, revision and reference integrity), without reimplementing M0–M4 business logic.

## M5 checkpoint — Vocabulary & Content (2026-10-20)

**M5 implementation in `master`: IndexedDB v4 authoritative language profiles and authored Island catalog, versioned sentences and vocabulary.** M0–M4 remain the owners of practice, evidence, memory scheduling and due-first recommendations respectively. Module launch/route, AI/TTS, monetization, login and cloud sync remain out of scope.

### Implementation graph (`$design-thinking`)

- **Shapes:** `LearningProfile {id,targetLanguage}`; `ContentIsland {profileId,island,vocabulary,archived}`; `VocabularyEntry {id,sentenceId,sentenceRevision,term,meaning}`; `IslandDraft` for controlled create/edit, and optimistic expected Island revision.
- **A happy path:** choose/create language profile -> edit sentences and explicitly linked vocabulary -> validate source language, target language and unique IDs -> compare prior sentence text -> advance *only changed sentence revisions* and Island revision -> save to `catalogs` IndexedDB store with revision-CAS -> current active catalog feeds M4 via `planStored(profile,now)` in the same IndexedDB read snapshot as SRS review states -> contiguous same-Island session start checks current Island revision/content in the **session-create transaction** -> existing M0–M3 commit/evaluation/SRS pipeline continues.
- **E expected failures:** duplicate Island/profile identity, changed Island revision from another tab, mixed-language catalog, malformed sentence/vocabulary entry, orphaned/stale vocabulary revision, stale/archive recommendation on practice start, catalog template ID collisions, corrupt restored records, quota/full backup errors. Rejected IndexedDB writes roll back; no successful save acknowledgement on failure.
- **R resources:** Native IndexedDB schema v4 adds `profiles` and `catalogs` (index by profileId); no new DB package, server, auth or background worker. Starter English Island is installed **only once** using an atomic seed marker; archiving/emptying content does not silently reintroduce starter materials.
- **History contract:** Editing title/vocabulary/archived status increments Island version while leaving unchanged sentence revisions and SRS identities intact. Editing prompt/answer increments that sentence revision; prior history and memory remain stored, but M4 only plans against the current revision. Vocabulary tied to a rewritten sentence requires explicit author confirmation before being retained. Archive hides material from M4 without deleting history.
- **Execution/concurrency:** Per-profile catalog reads are IndexedDB snapshots; save, archive and import use readwrite transactions and CAS; concurrent tabs cannot overwrite content with stale revisions. An M4 plan is advisory; practice start re-validates the chosen catalog revision and exact sentence snapshots inside the same transaction that creates the session.
- **Import/export:** `modu-language-catalog` v1 is a *template*, imported only as new IDs atomically; template import is not a progress migration and does not preserve prior SRS events. Export and import share a 32 MiB UTF-8 size cap. Full `modu-language-learning` backup **v3** captures profiles, all Islands (including archived), vocabulary, session history, attempts, memory SRS, and latest-session reference atomically; old full backups v1/v2 remain importable and seed the legacy starter catalog. Invalid restore is rejected without clearing existing stores. Full backup retains the existing 256 MiB limit.
- **UI:** `ContentEditor.svelte` supports sentence/vocabulary authoring with controlled editable IDs and source linkage; workspace shows language selection, catalog, archive/unarchive, template import/export, and existing full backup controls. Direct public launcher enablement remains deferred.

### Code / verification / code-review

- `src/lib/modules/language-learning/core/content.ts`: content validation, sentence revision mapping, vocabulary linkage and archive transition.
- `src/lib/modules/language-learning/adapters/persistence.ts`: IDB v4 migration, profile/catalog writes, `planStored`, atomic stale-content session guard, imports and v3 full backup.
- `src/lib/modules/language-learning/controller/language-learning.svelte.ts`, `components/ContentEditor.svelte`, and `LanguageLearningWorkspace.svelte`: UI composition and controller behavior.
- `test/unit/language-learning-content.test.ts` + `test/unit/language-learning-content-indexeddb.test.ts`: revision integrity, vocabulary validity, rollback, concurrent edits, language separation, archive, backup migration and stale plan rejection.
- `$code-review` detected and fixed two major issues: silently carrying vocabulary into rewritten sentence revisions without confirmation; and starting a new session from a catalog revision edited/archived in another tab. Fixed a local backup-template limit mismatch and last-session language-profile recovery.
- Verify GitHub CI final run before claiming closure. Browser-native E2E, robust larger-scale catalog importing, and final public launch acceptance remain separate milestones.
- **Next M6:** Audio & Progress. Reuse content, session evidence, SRS due state, and profile isolation; do not introduce accounts or paid integrations.

### Final M5 verification and code-review remediation

- **Code review — resolved:** retained vocabulary on edited sentence text now requires explicit author reconfirmation, rather than silently reattaching old lexemes to new sentence meanings.
- **Code review — resolved:** start of newly recommended practice checks the current, non-archived catalog revision and every selected sentence snapshot in the same IDB transaction that creates the session; pre-existing active practice snapshots remain unchanged.
- **Code review — resolved:** earlier language's completed session is hidden when another language is selected; on browser reload, a saved session selects its historic profile if available.
- **Code review — resolved:** one-time schema v4 seed backfills profile IDs and target languages from immutable M0–M3 session snapshots. Older full-backup v1/v2 import also infers legacy profile identities, preserving accessibility without rewriting attempts or SRS state.
- **Code review — resolved:** writer admission (save/edit, unarchive, template import) enforces M4's 100 active Islands / 1000 active sentences per profile so users cannot create a catalog that the planner rejects. Duplicate imported Island IDs produce a conflict before capacity validation, with atomic rollback.
- **Code review — resolved:** catalog template export/import have symmetrical 32 MiB UTF-8 limits; *templates* do not migrate SRS history, revisions or archive state. Full backup v3 remains the lossless recovery format for practice, profiles, archived material, vocabulary and SRS.
- **Final test evidence:** https://github.com/howlil/modu-app/actions/runs/39347612996 — Bun frozen install, Svelte/TS check, unit tests (including fake-indexeddb migration, CAS, import rollback, archiving, revision & SRS compatibility), and Cloudflare build all passed. Browser-native E2E and production launcher activation have not been performed.
