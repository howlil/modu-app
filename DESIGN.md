# Module — Design Contract

Module is a local-first browser utility platform.

## 1. Product thesis

```text
intent → open tool → do task locally → get result → leave
```

Optimize for time-to-result, correctness, privacy, low cognitive load, and low runtime cost.

## 2. Current scope

Only three validation modules exist right now:

```text
Module
├── Merge PDF
├── Pomodoro
└── Typing Practice
```

Do not add JSON, UUID, image tools, category pages, PWA layers, storage abstractions, OPFS wrappers, or generic worker frameworks until a current module actually needs them.

## 3. Navigation now

Home directly exposes the three modules.

Home tool presentation:

- tools render as compact square app tiles
- each tile is 1:1 with a clear icon and short name
- tiles may use distinct solid pastel surfaces to make each tool feel like an app
- do not add descriptions inside the launcher grid
- desktop uses a small 3-column grid; narrow screens use 2 columns
- the tile itself is the interaction target; avoid extra arrows, badges, or metadata

Scrolled navigation:

- at the top of the page, navigation spans the normal content width
- after scrolling, it contracts into a rounded floating capsule
- use restrained glassmorphism: translucent background, subtle border, backdrop blur, soft shadow
- GitHub Sponsor and Star are real actions, not decorative badges

Do not build search, categories, pinned tools, recent tools, or contextual sidebars before tool count/user behavior makes them necessary.

## 4. Module registry

Keep only metadata consumed today:

```ts
type ModuleDefinition = {
  id: string;
  name: string;
  route: string;
  layout: 'file-transform' | 'focus';
};
```

## 5. UI system

### Component source

**shadcn-svelte is the default UI component system.**

Application code composes generic UI from:

```text
$lib/components/ui/*
```

Current installed primitives:

- Button
- Card
- Input

When another generic UI component is needed, install it from the official shadcn-svelte registry:

```bash
bun x shadcn-svelte@latest add <component>
```

Do not rebuild an equivalent generic component when shadcn-svelte already provides it.

Bits UI is an implementation dependency underneath shadcn-svelte. Routes and app-specific components should not import `bits-ui` directly when a shadcn-svelte component exists.

Allowed custom components are product compositions such as:

- `AppHeader`
- `ToolHeader`
- `ToolCard`

Those components should compose shadcn primitives rather than recreate buttons, cards, badges, inputs, dialogs, tabs, selects, tooltips, popovers, switches, and other generic controls.

Native semantic HTML remains valid for structural elements such as `section`, `header`, `label`, headings, and text.

### Styling

Tailwind CSS v4 is the styling system.

The semantic shadcn token layer is the design-system API:

```text
background / foreground
card / card-foreground
primary / primary-foreground
secondary / secondary-foreground
muted / muted-foreground
accent / accent-foreground
border / input / ring
destructive
```

Module maps those tokens to its identity:

- warm white background
- ink foreground
- restrained cobalt primary
- soft cobalt secondary/accent
- neutral borders
- quiet, utilitarian surfaces

Prefer semantic classes such as `bg-card`, `text-muted-foreground`, `border-border`, and `bg-primary` over one-off raw colors.

Avoid:

- decorative gradients
- inner shadows
- card spam
- bespoke button/input/card implementations
- parallel styling systems outside shadcn + Tailwind
- badges for static product claims, architecture labels, or decorative metadata
- explanatory copy for behavior already obvious from the title, control, or surrounding context
- developer/implementation notes in user-facing UI

Copy rule:

> UI should not explain what is already obvious from the control, title, or context.

Privacy rule:

- show privacy copy only near a meaningful sensitive-input boundary
- do not repeat "local", "browser-first", or "no upload" across header, hero, and every tool
- prefer one short sentence over multiple badges

SvelteKit 3 compatibility: Module restores `$lib -> src/lib` in `vite.config.ts` because shadcn-svelte registry output uses `$lib`. Application/domain code may continue using `#lib`; shadcn-generated code may use `$lib`.

UIArc remains a visual/interaction reference while its official implementation is React-only. Do not manually port its React components into Svelte.

## 6. Local-first contract

```text
user input/file
      ↓
browser
      ↓
result
```

Do not send user content to APIs, analytics, logs, or third parties unless the product explicitly changes that contract.

Do not claim offline support until it is implemented and tested.

## 7. Engineering boundary

```text
routes/UI
   ↓
module logic
   ↓
browser APIs / required libraries
```

Do not create platform abstractions before a concrete requirement needs them.

The small Module Registry remains because Home already consumes shared metadata.

## 8. Deployment

```text
GitHub
  ↓
Cloudflare Workers build
  ↓
Bun install + SvelteKit build
  ↓
.svelte-kit/cloudflare
  ↓
Cloudflare Workers
```

Package manager: Bun.

Deployment target: Cloudflare Workers Builds.

Cloudflare runs `bun run build`, then `npx wrangler deploy`. `wrangler.jsonc` points to `.svelte-kit/cloudflare/_worker.js` and serves `.svelte-kit/cloudflare` as assets.

Workers Builds is the intended deployment model for this repository.

## 9. Definition of done

A module is done when its core job works, privacy copy matches reality, errors are recoverable, mobile/keyboard basics work, relevant deterministic logic is tested, and build/check passes.

UI work is complete only when generic controls use shadcn-svelte instead of unnecessary bespoke primitives.

## 10. Decision rule

```text
What current user-visible requirement needs this?
```

If there is no concrete answer, do not add it yet.
