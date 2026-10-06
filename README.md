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
├── badge/
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

## Cloudflare Pages

This repository targets **Cloudflare Pages Git Integration**.

Create the project from:

```text
Workers & Pages
→ Create application
→ Pages
→ Import an existing Git repository
→ howlil/modu-app
```

Use:

```text
Production branch: master
Build command: bun run build
Build output directory: .svelte-kit/cloudflare
Root directory: /
```

Build environment:

```text
BUN_VERSION=1.2.15
NODE_VERSION=22.17.0
```

A proper Pages Git project deploys automatically after the build succeeds.

There should be **no Deploy command field** for this repository.

If the Cloudflare screen shows a Deploy command such as:

```bash
npx wrangler deploy
```

you created or connected the repository as a **Workers Builds** project. Do not add a Worker entrypoint to make that command pass. Recreate/import the repository under the **Pages** flow instead.

The SvelteKit Pages build output is:

```text
.svelte-kit/cloudflare
```

## Source of truth

1. `AGENTS.md`
2. `DESIGN.md`
3. existing code/tests
