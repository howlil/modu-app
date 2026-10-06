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

Do not build search, categories, pinned tools, recent tools, or contextual sidebars before tool count/user behavior makes them necessary.

## 4. Module registry

Keep only metadata consumed today:

```ts
type ModuleDefinition = {
  id: string;
  name: string;
  description: string;
  route: string;
  layout: 'file-transform' | 'focus';
};
```

## 5. UI

Tailwind CSS v4 is the styling system.

Direction:

- warm white + ink
- restrained cobalt
- quiet and utilitarian
- borders before shadows
- no decorative gradients
- no inner shadows
- no card spam

Generic interactive primitives are library-first:

1. Bits UI
2. existing reusable Module component
3. native HTML when sufficient
4. custom primitive only when necessary

UIArc is a visual/interaction reference while its official implementation is React-only. Do not manually port its React components into Svelte.

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
Cloudflare Pages build
  ↓
Bun install + SvelteKit build
  ↓
.svelte-kit/cloudflare
  ↓
Cloudflare Pages
```

Package manager: Bun.

Deployment target: Cloudflare Pages Git Integration.

Cloudflare builds with `bun run build` and publishes `.svelte-kit/cloudflare` automatically. The normal deployment path has no Wrangler deploy command.

If a Cloudflare project asks for `wrangler deploy`, it is a Workers Builds project and should be recreated/imported through the Pages flow rather than adapted into a Worker.

## 9. Definition of done

A module is done when its core job works, privacy copy matches reality, errors are recoverable, mobile/keyboard basics work, relevant deterministic logic is tested, and build/check passes.

## 10. Decision rule

```text
What current user-visible requirement needs this?
```

If there is no concrete answer, do not add it yet.
