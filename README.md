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
