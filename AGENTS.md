# AGENTS.md

## Purpose

Make the smallest correct change with the least ceremony.

## Source of truth

1. current user request
2. `AGENTS.md`
3. `DESIGN.md`
4. relevant code/tests

Do not create per-task planning documents.

## Workflow

```text
UNDERSTAND
  ↓
IDENTIFY OBSERVABLE OUTCOME
  ↓
CHANGE THE SMALLEST OWNER
  ↓
VERIFY ACTUAL RISK
  ↓
INSPECT DIFF
  ↓
STOP
```

## Current scope

- Merge PDF
- Pomodoro
- Typing Practice

Do not add speculative modules, platform directories, persistence layers, PWA infrastructure, generic worker frameworks, categories, or search until a current requirement needs them.

Prefer deleting dead scaffold over preserving hypothetical architecture.

## UI

- Tailwind CSS v4 is the default styling system.
- Reuse components when repetition is real.
- For generic interactive primitives, use shadcn-svelte first.
- Import generic UI from `$lib/components/ui/*`; do not import `bits-ui` directly from routes when shadcn-svelte provides the component.
- Add new generic components with `bun x shadcn-svelte@latest add [component]`.
- UIArc is a visual/interaction reference only while its official implementation is React-only.
- Do not manually port UIArc React components to Svelte.
- Do not use badges for static product claims, architecture labels, or decorative metadata.
- Do not add explanatory copy when the title/control/context already makes the behavior clear.
- Never expose scaffold state, implementation notes, vertical-slice notes, or engineering rationale in user-facing copy.
- Privacy copy belongs near sensitive input boundaries; do not repeat the same privacy claim across the app.
- A Card is not the default container. Use it only when the content is a real independent object or functional group.

## Architecture

```text
route/UI
  ↓
module logic
  ↓
browser APIs / required libraries
```

Extract shared ownership only when it is real.

## Local-first

User content stays in the browser for local modules.

Do not send files or typed content to analytics, logs, APIs, or error reporting without an explicit product requirement.

Do not claim offline behavior until implemented and tested.

## Tests

Use test-first for deterministic behavior and regressions where a faithful boundary exists. Do not force tests for CSS-only work, docs, or trivial wiring.

## Bun

Bun is the package manager.

```bash
bun install
bun run dev
bun run check
bun run test
bun run build
```

Do not introduce pnpm/npm/yarn scripts or lockfiles. Commit `bun.lock` after the first successful `bun install`.

## Cloudflare

Deployment target is **Cloudflare Workers Builds**.

Cloudflare configuration:

```text
Production branch: master
Build command: bun run build
Build output directory: .svelte-kit/cloudflare
Root directory: /
```

Deploy command: `npx wrangler deploy`. Wrangler deploys the generated SvelteKit Worker and its static assets.

This repository intentionally uses Workers Builds. The deploy command is `npx wrangler deploy`, backed by the committed `wrangler.jsonc`.

Do not remove `wrangler.jsonc`; it prevents Wrangler auto-configuration during deploy.

## Completion

Confirm the requested outcome, run the minimum relevant verification, inspect the diff, state skipped checks honestly, then stop.
