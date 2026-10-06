# Module

Local-first browser utilities built with SvelteKit.

## Start

```bash
pnpm install
pnpm dev
```

## Verify

```bash
pnpm check
pnpm test:unit
pnpm test:e2e
pnpm build
```

## Architecture

Read these before material changes:

1. `AGENTS.md`
2. `DESIGN.md`
3. `.agents/product-design.md` when product behavior is unresolved
4. `.agents/engineering-design.md` when system boundaries are unresolved

Core dependency direction:

```text
routes/UI
   ↓
module
   ↓
platform
   ↓
browser APIs / libraries
```

Cloudflare distributes the app. The browser is the primary application runtime.

## UI stack

- Tailwind CSS v4 for styling and Module tokens
- shadcn-svelte as the preferred styled component registry
- Bits UI for accessible headless primitives
- Arc/UIArc as a visual/interaction reference only while its official components remain React-only

Do not hand-roll generic UI primitives when a suitable Svelte library component exists.

## Deploy to Cloudflare Pages

This repository targets **Cloudflare Pages** with the SvelteKit Cloudflare adapter.

### Git integration

Create a Pages project from this GitHub repository and use:

```text
Framework preset: SvelteKit
Production branch: master
Build command: pnpm build
Build output directory: .svelte-kit/cloudflare
Root directory: /
Node version: 22.17.0
```

Node is pinned in `.node-version` because SvelteKit 3 requires Node 22.17 or newer.

Cloudflare will build and deploy every push to the production branch and create preview deployments for eligible branches / pull requests.

### Wrangler deploy

Authenticate once:

```bash
pnpm wrangler login
```

Then deploy the current repository to the Pages project declared in `wrangler.jsonc`:

```bash
pnpm pages:deploy
```

Local Pages runtime preview:

```bash
pnpm pages:dev
```

The Pages output directory is:

```text
.svelte-kit/cloudflare
```

Do not replace the Pages deploy command with plain `wrangler deploy`; that targets Cloudflare Workers rather than the Pages deployment flow.
