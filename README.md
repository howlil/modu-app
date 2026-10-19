# Module

Local-first browser utilities built with SvelteKit, Tailwind CSS, shadcn-svelte, and Bun.

## Current scope

- Pomodoro
- Daily Execution (linked to Pomodoro focus sessions)

New modules require an end-to-end user workflow and must reuse existing capabilities rather than duplicate them.

## Architecture

```text
src/routes/                   route composition and API entry points
src/lib/components/ui/        shared shadcn-svelte primitives
src/lib/modules/pomodoro/     timer rules, activity, preferences, feature views
src/lib/modules/daily-execution/ planning, priorities, outcomes, reviews
src/lib/shared/focus-sessions/ shared session repository and task handoff
src/lib/platform/registry/    tool metadata and availability
extension/                    independent Chromium permission/enforcement boundary
test/unit/                    deterministic behavior and storage regression tests
```

Keep routes as composition points, feature-specific UI in its owning module,
pure logic separate from browser APIs, and localStorage keys backward compatible.
Do not create a generic feature plugin or state framework until a real requirement needs it.

## UI system

Generic UI primitives come from **shadcn-svelte** and live under:

```text
src/lib/components/ui/
├── button/
├── card/
├── input/
├── dialog/
├── tabs/
└── ...
```

Add another official component with:

```bash
bun x shadcn-svelte@latest add [component]
```

Application pages should import from `$lib/components/ui/*`, not from `bits-ui` directly when shadcn-svelte provides the component.

The Module palette is mapped to shadcn semantic tokens in `src/app.css`.

## Local development

```bash
bun install
bun run dev
```

Verify:

```bash
bun run check
bun run test
bun run build
```

The committed `bun.lock` is the dependency source of truth; CI uses `bun install --frozen-lockfile`.

## Cloudflare Workers

This repository intentionally uses **Cloudflare Workers Builds**, matching the deployment model used by `howlil-app`.

Dashboard configuration:

```text
Build command: bun run build
Deploy command: npx wrangler deploy
Root directory: /
Production branch: master
```

Deployment contract:

```text
bun run build
  ↓
@sveltejs/adapter-cloudflare
  ↓
.svelte-kit/cloudflare/_worker.js
.svelte-kit/cloudflare/*
  ↓
npx wrangler deploy
  ↓
wrangler.jsonc
  ↓
Cloudflare Worker + Static Assets
```

The committed `wrangler.jsonc` is required. It prevents Wrangler from trying to auto-configure SvelteKit during deploy.

Do not run `sv add cloudflare` in CI and do not change the build script to `wrangler types --check && vite build`.

## Source of truth

1. `AGENTS.md`
2. `DESIGN.md`
3. existing code/tests


## Feature request API protection

The public POST /api/feature-request endpoint creates GitHub issues. It has:

- exact same-origin check (including rejecting a missing Origin);
- Cloudflare Workers Rate Limiting bindings: up to 5 requests/minute per IP and up to 20 requests/minute with a shared key **per Cloudflare location**;
- JSON and payload validation, body size cap, and an inert honeypot.

These limits are configured in wrangler.jsonc. Workers Rate Limiting is eventually consistent, so brief bursts may exceed the configured values. The per-IP key can also group users sharing an IP address. Neither limiting nor Origin checking is authentication or complete protection against scripted abuse.

Configure GITHUB_TOKEN as an encrypted Cloudflare Worker secret: a fine-grained GitHub PAT with **Issues: Read and write** permission on **howlil/modu-app only**. Never put the token in repository files, browser code, or public variables.

If either rate limiting binding is unavailable, the endpoint returns 503 without creating a GitHub issue. When a limit is exceeded, it returns 429. The UI offers a link to create the issue directly on GitHub if submission fails. Locally, set GITHUB_TOKEN in an untracked .dev.vars file.

After deployment, check that requests with missing/foreign Origin return 403; invalid JSON returns 400 (within the rate limits); and excess requests return 429. A test using a valid payload creates a real GitHub issue, so avoid it unless intentional.


## Daily: local activities only

Daily is a local-first execution workspace. Capture an activity by title, select it for
Today, choose Next, start the existing Pomodoro timer and complete the activity locally.
No account connection, external task synchronisation, D1 database or OAuth configuration
is necessary.

Optional HTTPS references can be added from **Activity details → More details**. A
reference URL is plain task metadata, not a connection to an external provider.

**Legacy compatibility:** a previously selected Google/GitHub-linked activity is read
back as a regular local task with its original local ID, date selections, completion
status, checkpoint and recorded work intact. A safe HTTPS link from the old reference is
preserved as an optional task reference. Obsolete source connections and unselected
source candidates are not imported into the new UI. The original localStorage snapshot
is not overwritten just by viewing it; changes persist when the user next edits.

The separate Review → Evidence → Sources workflow is for importing learning evidence
and is not an external task-management connection.

Verification: `bun run check`, `bun run test`, `bun run build` and the
`Daily Browser E2E` workflow. The optional manual `Daily Production Smoke`
workflow exercises isolated disposable browser storage against the deployed site.
