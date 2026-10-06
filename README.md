# Module

Local-first browser utilities built with SvelteKit, Tailwind CSS, Bits UI, and Bun.

## Current scope

Only three modules are kept while the architecture is still being proven:

- Merge PDF
- Pomodoro
- Typing Practice

Do not add more tools until one of these is implemented end-to-end and the shared pattern is clear.

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

The first `bun install` will create `bun.lock`. Commit that lockfile once generated.

## Cloudflare Pages

This repository is a **Cloudflare Pages** project, not a Worker project.

### Recommended: Pages Git integration

In Cloudflare, create/import it from **Workers & Pages → Pages → Import an existing Git repository**.

Use:

```text
Production branch: master
Build command: bun run cf:build
Build output directory: .svelte-kit/cloudflare
Root directory: /
```

Build environment variables:

```text
BUN_VERSION=1.2.15
NODE_VERSION=22.17.0
SKIP_DEPENDENCY_INSTALL=1
```

`SKIP_DEPENDENCY_INSTALL=1` is intentional because `bun run cf:build` performs `bun install` itself.

For a normal Pages Git-integrated project, Cloudflare deploys the build output automatically after a successful build.

### If your Cloudflare project has a Deploy command field

Do **not** use:

```bash
wrangler deploy
```

That command targets Workers and causes the "Missing entry-point to Worker script" error.

Use:

```bash
bunx wrangler pages deploy .svelte-kit/cloudflare --project-name=modu-app
```

Or recreate/import the repository as a proper **Pages** project and let Pages deploy automatically.

### Manual deploy

```bash
bun install
bun run deploy
```

The manual deploy script builds first, then runs `wrangler pages deploy`.

## Source of truth

1. `AGENTS.md`
2. `DESIGN.md`
3. existing code/tests

Cloudflare distributes the app. The browser is the application runtime.
