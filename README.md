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
