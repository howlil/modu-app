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

The public POST /api/feature-request endpoint writes GitHub issues. It uses **all** of the following guards before any GitHub API call:

- exact same-origin check (requests without an Origin are rejected);
- Cloudflare Workers per-IP (5/minute) and global (20/minute) Rate Limiting bindings, configured in wrangler.jsonc;
- Cloudflare Turnstile browser widget with server-side Siteverify, action and hostname validation;
- request validation, body size cap and an inert honeypot.

For production, create a Cloudflare Turnstile widget and allow the hostname modu.howlil.site (plus any preview domains you intentionally support). Configure these Worker environment variables/secrets in the Cloudflare dashboard:

- TURNSTILE_SITE_KEY: public Turnstile site key (plain Worker variable).
- TURNSTILE_SECRET_KEY: Turnstile secret (encrypted Worker secret).
- GITHUB_TOKEN: fine-grained GitHub PAT with **Issues: Read and write** on **howlil/modu-app only** (encrypted Worker secret).

Never put the Turnstile secret or GitHub token in the repository, public client variables, or browser code. For local Worker development, set values via an untracked .dev.vars file.

If any required configuration or limiter is missing, direct issue creation fails closed; users can use the GitHub issue creation fallback. After configuring the secrets, deploy the Worker and verify valid submission once, missing Origin returns 403, missing/invalid Turnstile token returns 403, and excessive requests return 429. Do not run the valid submission smoke test unless you intend to create a real issue.

Workers Rate Limiting is eventually consistent and applies in each Cloudflare location; complement it with a Cloudflare WAF custom rule for POST /api/feature-request if you need stronger edge-wide protection.
