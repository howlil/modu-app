# Feature architecture and boundaries

Mandatory for all feature development. Follow this file with `AGENTS.md` and `DESIGN.md`.

## Non-negotiable feature folder contract

For every **implemented** module under `src/lib/modules/<feature>/`, use this canonical layout from the start:

```text
<feature>/
├── <Feature>Workspace.svelte      # the only root-level implementation file
├── core/                         # pure domain algorithms, state transitions, types
├── adapters/                     # browser storage, audio, file APIs and transports
├── controller/                   # per-mounted-view *.svelte.ts state factory
└── components/                   # feature-specific Svelte UI
```

All four directories must be used for an implemented module. Do not flatten a module, introduce alternate responsibility buckets or put feature business logic at the module root. The workspace is presentation composition, not a place for new business orchestration. Routes delegate to the workspace and stay thin. Reusable design primitives remain in `src/lib/components/ui/`. Placeholder routes (`coming-soon`) do **not** justify speculative modules or empty scaffolding.

**No automatic refactoring:** When adding or updating a feature, use its established owners and only touch files necessary to deliver that feature. Do not reorganize existing code, split large files, rename modules or initiate cross-feature cleanup without the user's explicit refactoring request. Fix a boundary violation in newly written code before merging; if a legacy violation blocks a requested change, explain the smallest necessary adjustment rather than starting a broad refactor.

## Dependency direction

```text
src/routes (route entry / composition)
  -> src/lib/modules/<feature>/components (presentation)
  -> src/lib/modules/<feature>/controller (per-instance Svelte state and workflow)
  -> feature pure logic + feature-owned browser adapters
  -> browser storage, extension, sound, notification APIs

src/routes/api -> src/lib/server -> external services / Cloudflare bindings
```

Presentation triggers controller actions; controllers call pure functions and adapters and expose reactive state back to views. Dependencies never flow from pure logic into UI, adapters, or routes.

## Placement rules

- `src/routes/**`: SvelteKit URL and API entrypoints. Do not implement feature state machines, browser persistence, or long interaction workflows in page routes.
- `src/lib/modules/<feature>/components/**`: feature-only UI; no cross-feature private imports. Use shared UI primitives from `src/lib/components/ui/**`.
- `src/lib/modules/<feature>/controller/*.svelte.ts`: Svelte 5 factory invoked once per mounted workspace. Do not export singleton mutable `$state` (SSR/shared state hazard). Own session orchestration and side-effect coordination.
- `src/lib/modules/pomodoro/core/{timer,activity}.ts`: deterministic state machines, aggregations and calculations. This folder never re-exports storage or imports browser adapters.
- `src/lib/modules/pomodoro/adapters/{persistence,activity-storage,focus-protection,sounds,wake-lock}.ts`: feature-owned browser/integration code. Adapters may import `../core/` for types and pure algorithms.
- `src/lib/modules/<feature>/`: never place loose `.ts` or extra UI files at this root. Only `<Feature>Workspace.svelte` belongs here; implemented modules must already use `core/`, `adapters/`, `controller/`, and `components/`.
- Pure domain modules: deterministic state transitions, calculations and validation. No `window`, `document`, `localStorage`, `indexedDB`, `chrome`, Svelte components or external API calls.
- Feature-owned adapters: browser storage, audio, notifications and extension transport; no imports from controllers or views.
- `src/lib/components/ui/**`: generic shadcn primitives. No domain or feature imports.
- `src/lib/platform/registry/**`: tool availability metadata only.
- `src/lib/server/**`: server-only security, secrets, and service integrations. No client-side imports.
- `extension/**`: separate Chromium runtime. Its messaging contract must be compatible with the web bridge.

## M2 adaptive execution rules

- Pomodoro remains the only timer. Focus interval accounting lives in `pomodoro/core/focus-accounting.ts` and is persisted in the existing timer snapshot. Completed and partial focus sessions share the original activity store and stable session IDs; partial sessions use optional `completionKind` metadata for backward compatibility.
- Daily Execution owns task checkpoints, deterministic replan suggestions, user-approved plan revisions and explicitly entered manual work intervals. Its existing local-storage record is extended backward-compatibly with `manualEntries`.
- Manual work is never generated from inactive browser tabs. Overlap validation uses the latest completed focus records and manual intervals; the recorded total is the sum of explicit entries, not an estimate of an entire workday.
- Replanning is a proposal, not a mutation until accepted. Previously recorded focus, outcomes and manual intervals must remain unchanged when capacity is changed.
- A task remains incomplete after a focus session. Session completion and task evidence are independent.
- Do not duplicate the timer, calendar, heatmap or shared focus-session repository.

## Daily Execution integration boundary

`src/lib/modules/daily-execution/` follows the canonical workspace/core/adapters/controller/components layout. It owns the goal, tasks, capacity plan, completion evidence and review. It does not own focus timers.

`src/lib/shared/focus-sessions/` owns the existing `module-pomodoro-activity` session storage contract, optional task IDs, and one-shot same-tab task handoff. Pomodoro retains the exclusive timer state machine and exposes its legacy activity-storage import as a compatibility facade. Daily Execution imports the shared session repository, never Pomodoro's private controllers/components or timer adapters. Do not add another focus-session collection, timer implementation, or heatmap to Daily Execution.

## Pomodoro dependency map

```text
routes/pomodoro/+page.svelte
  -> PomodoroWorkspace.svelte
     -> components/TimerView, ActivityView, SettingsView
     -> controller/pomodoro.svelte.ts
        -> core/timer.ts, core/activity.ts
        -> adapters/persistence.ts, activity-storage.ts,
           focus-protection.ts, sounds.ts, wake-lock.ts
     -> components can import core types/calculations and adapter types
        only when needed to render settings
adapters -> core
core -> (no adapters or UI)
```

When editing Pomodoro: never recreate root-level `timer.ts`, `activity.ts`, `persistence.ts`, `activity-storage.ts`, `focus-protection.ts`, `sounds.ts`, or `wake-lock.ts`. Update imports and the architecture test when making a deliberate boundary adjustment.

## Code quality

1. Prefer the smallest feature owner and clear names. No generic `utils` dumps, speculative frameworks or mandatory layer-per-file boilerplate.
2. Strict TypeScript and explicit contracts. Reuse a single type definition for state and preferences; avoid duplicate interfaces and `any`.
3. Keep side effects at adapter/controller boundaries and domain functions independently testable.
4. Do not change storage keys, snapshot formats, extension messages or APIs in structural refactors without migration/compatibility tests.
5. Preserve accessibility, keyboard navigation, SSR correctness and local-first privacy.
6. Add regression and architectural tests for observed risks. Never suppress CI failures to complete a refactor.
7. No drive-by refactoring or extraction. New code belongs in the correct boundary immediately; existing code remains in place unless an explicit refactor is requested.
8. For any new implemented feature, add/update architecture tests to cover its structural and import boundaries; structural violations must fail CI.

## Mandatory workflow

Before: read `AGENTS.md`, `DESIGN.md`, this document and the feature's existing contracts. Identify the owning module and import direction.

During: implement one coherent change, preserve behavior, extend tests, review dependency direction and update docs.

After:
```sh
bun run check
bun run test
bun run build
```

Verify the latest GitHub Actions result before reporting success.

Current boundary contract: Pomodoro and Daily Execution follow the same mandatory structure. Every new implemented module follows it immediately, with no later refactor phase. CI enforces layout and import direction for all modules, not just named legacy features.
