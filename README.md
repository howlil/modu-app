# Module

Local-first browser utilities built with SvelteKit, Tailwind CSS, shadcn-svelte, and Bun.

## Current scope

- Merge PDF
- Pomodoro
- Typing Practice

Do not expand the tool catalog until one current module is implemented end-to-end.

## UI system

Generic UI primitives come from **shadcn-svelte** and live under:

```text
src/lib/components/ui/
├── button/
├── card/
└── input/
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

Commit `bun.lock` after the first successful `bun install`.

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
