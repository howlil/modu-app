# Feature architecture and boundaries

Mandatory for all feature development. Follow this file with `AGENTS.md` and `DESIGN.md`.

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
- `src/lib/modules/typing/core/{trainer,session}.ts`: pure learning, keyboard statistics, drill text and scoring behavior.
- `src/lib/modules/typing/adapters/{persistence,sounds}.ts`: localStorage and browser audio. Adapters may depend on `../core/` only, not UI or controller.
- `src/lib/modules/<feature>/*.ts`: future small features may start flat, but use the same dependency direction; add `core/` and `adapters/` once boundaries exist rather than creating empty folders.
- Pure domain modules: deterministic state transitions, calculations and validation. No `window`, `document`, `localStorage`, `indexedDB`, `chrome`, Svelte components or external API calls.
- Feature-owned adapters: browser storage, audio, notifications and extension transport; no imports from controllers or views.
- `src/lib/components/ui/**`: generic shadcn primitives. No domain or feature imports.
- `src/lib/platform/registry/**`: tool availability metadata only.
- `src/lib/server/**`: server-only security, secrets, and service integrations. No client-side imports.
- `extension/**`: separate Chromium runtime. Its messaging contract must be compatible with the web bridge.

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

## Typing dependency map

```text
routes/typing/+page.svelte
  -> TypingWorkspace.svelte
     -> components/ProgressView, SettingsView
     -> controller/typing.svelte.ts
        -> core/trainer.ts, core/session.ts
        -> adapters/persistence.ts, sounds.ts
adapters -> core
core -> (no adapters or UI)
```

Typing key-event orchestration, session state, saving and audio lifecycle belong in the per-workspace controller. Character, keyboard and feedback rendering stay in the workspace/components. Preserve `module-typing-*-v1` storage keys, strict correction, lesson selection, drill progression, audio disposal and keyboard shortcuts. Do not recreate root-level `trainer.ts`, `session.ts`, `persistence.ts` or `sounds.ts`.

## Code quality

1. Prefer the smallest feature owner and clear names. No generic `utils` dumps, speculative frameworks or mandatory layer-per-file boilerplate.
2. Strict TypeScript and explicit contracts. Reuse a single type definition for state and preferences; avoid duplicate interfaces and `any`.
3. Keep side effects at adapter/controller boundaries and domain functions independently testable.
4. Do not change storage keys, snapshot formats, extension messages or APIs in structural refactors without migration/compatibility tests.
5. Preserve accessibility, keyboard navigation, SSR correctness and local-first privacy.
6. Add regression and architectural tests for observed risks. Never suppress CI failures to complete a refactor.
7. Prefer gradual extraction over replacing an entire working feature.

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

Current boundary contract: Pomodoro and Typing both use feature-owned workspace + per-instance controller + pure core + browser adapters; small future features can start flat until they need explicit grouping.
