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
- `src/lib/modules/<feature>/*.ts`: other small features may stay flat; create `core/` and `adapters/` only when the boundary already exists in the feature.
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

Current known debt: the Typing route still owns presentation and workflow state; extract its feature controller when changing that subsystem, without rewriting the algorithm just to satisfy a directory template.
