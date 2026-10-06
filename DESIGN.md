# Module — Design Contract

Module is a local-first browser utility platform.

This document is the canonical product, UX, and system-design contract for the repository. It captures the decisions that should remain stable while individual modules evolve.

Supporting detail lives in:

- `.agents/product-design.md`
- `.agents/engineering-design.md`

When implementation and this document disagree on a decision that matters to the requested change, do not silently invent a third direction. Preserve unrelated behavior, surface the conflict, and make the smallest coherent correction.

---

## 1. Product Thesis

Module helps users complete small, concrete browser tasks immediately.

```text
intent → find tool → do task locally → get result → leave
```

Optimize for:

1. time-to-result
2. trust
3. correctness
4. low cognitive load
5. low runtime/download cost

Do not optimize for time-in-app, engagement loops, account creation, or feature count.

### Product promise

Core utilities should be:

- instant to open
- usable without an account
- local-first by default
- private by default
- persistent only where persistence helps
- offline-capable where practical
- focused on one clear job

---

## 2. Product Model

Module is the platform.

Each utility is an independent **module**.

```text
Module
│
├── Files
│   ├── Merge PDF
│   ├── Split PDF
│   ├── Rotate PDF
│   └── Image tools
│
├── Developer
│   ├── JSON
│   ├── Base64
│   └── UUID
│
└── Productivity
    ├── Typing Practice
    └── Pomodoro
```

A module owns one user job, its domain behavior, its runtime state, and any persistence required for that job.

Modules must not depend on other modules.

Shared capability belongs to the platform.

---

## 3. Product Scope Gate

A new module belongs in Module when most of these are true:

1. It solves a concrete recurring task.
2. It can run primarily in the browser.
3. Local execution improves privacy, speed, cost, reliability, or offline use.
4. The result is understandable quickly.
5. It is useful without an account.
6. It does not add platform complexity disproportionate to its value.

Good fits:

- PDF manipulation
- image manipulation
- text/data transforms
- generators
- lightweight developer utilities
- timers and focused productivity utilities

Avoid early:

- cloud storage
- collaboration
- social features
- expensive server AI
- server-only conversion pipelines
- account-gated utilities
- high-fidelity Office conversion that requires heavy backend infrastructure

---

## 4. Information Architecture

The global UI must remain small even when the number of modules grows.

### Primary navigation model

```text
search = primary navigation
category = browsing
context = local navigation
```

Do **not** use a permanent global sidebar listing every tool.

More tools should strengthen discovery and metadata, not increase permanent navigation chrome.

### Global shell

Desktop:

```text
┌───────────────────────────────────────────────────────┐
│ Module            Search ⌘K       Local-first   ⚙    │
└───────────────────────────────────────────────────────┘
```

Mobile:

```text
Home   Files   Search   Dev   Settings
```

The mobile bottom bar is a compact navigation surface, not a duplicate list of all modules.

---

## 5. Home — Discovery Layer

Home is a launcher, not a dashboard.

Order:

```text
search
  ↓
recent
  ↓
pinned
  ↓
explore categories
```

Home must not become an all-tools wall.

### Home behavior

Search answers:

> “I know what I want.”

Recent and pinned answer:

> “I use this often.”

Categories answer:

> “I want to browse.”

Recommended structure:

```text
Useful tools.
Nothing extra.

[ What do you want to do?                ⌘K ]

Recent
...

Pinned
...

Explore
Files
Developer
Productivity
Images
```

---

## 6. Search / Command Palette

Search is a first-class navigation system.

It should search:

- module name
- verbs
- common intent words
- category
- tags
- aliases/keywords

Example:

```text
merge
combine
pdf
document
```

may all resolve to **Merge PDF**.

Search should eventually derive from the Module Registry rather than hardcoded UI lists.

Keyboard shortcut:

```text
⌘K / Ctrl+K
```

Search should work from every major page.

---

## 7. Category Pages — Browsing Layer

Category pages are for discovery when the user does not know the exact tool name.

Avoid giant card grids.

Prefer:

```text
Files

Search in Files...

PDF
  Merge PDF
  Split PDF
  Rotate PDF
  PDF → Image

Images
  Compress Image
  Resize Image
  Convert Image
```

Use:

```text
category
  ↓
group
  ↓
compact tool list
```

Categories are browsing aids, not rigid ontology.

A module may have:

```ts
{
  primaryCategory,
  group,
  tags,
  keywords,
  related
}
```

Search should use all useful metadata.

---

## 8. Tool Pages — Contextual Workspace

When a user opens a tool, global discovery should recede.

A tool page prioritizes:

```text
context
  ↓
task
  ↓
input
  ↓
options
  ↓
action
  ↓
result
```

Do not show unrelated tools beside the primary workflow.

For related tools, prefer:

- small contextual navigation for the same group, e.g. PDF
- related-tool links after the workspace

Example:

```text
Module / Files / PDF / Merge PDF

Merge PDF
Combine PDF files locally.
● Files stay on this device

[ workspace ]   [ output/options ]

Related
Split PDF · Rotate PDF · PDF → Image
```

---

## 9. Reusable Tool Layout Archetypes

Do not design every tool from scratch.

Every new module should first map to an existing archetype.

### A. File Transform

For:

- PDF tools
- image tools
- file converters

Desktop:

```text
workspace/input          options/output
───────────────────      ──────────────
files / preview          configuration
                         primary action
```

Mobile:

```text
workspace
↓
options
↓
action
↓
result
```

### B. Text Transform

For:

- JSON
- Base64
- formatters
- text conversion
- diff-like transforms

```text
input                 output
─────────────         ─────────────
text/code             transformed text

[ primary action ] [ copy ]
```

### C. Generator

For:

- UUID
- QR
- hashes
- lorem
- generated values

```text
options
  ↓
generate
  ↓
result list / preview
```

### D. Focus / Continuous Interaction

For:

- Pomodoro
- stopwatch
- counters
- typing practice

The primary interaction owns the visual center.

Do not force a side-panel layout where the task is continuous interaction.

---

## 10. Module Registry

The registry is the canonical source for module discovery metadata.

Target shape:

```ts
type ModuleDefinition = {
  id: string;
  name: string;
  description: string;
  route: string;

  primaryCategory: ModuleCategory;
  group?: string;

  keywords: string[];
  tags: string[];

  layout:
    | 'file-transform'
    | 'text-transform'
    | 'generator'
    | 'focus';

  capabilities: Array<
    | 'storage'
    | 'files'
    | 'worker'
    | 'offline'
  >;

  related?: string[];
};
```

The registry should drive:

- search
- command palette
- category pages
- related tools
- recent tools
- pinned tools
- breadcrumbs where practical

Do not duplicate the same tool metadata across unrelated UI files.

---

## 11. Visual System

Module should feel:

- quiet
- precise
- lightweight
- utilitarian
- premium without decoration
- dense enough for work
- easy to scan

Reference qualities:

- Linear
- Vercel
- Raycast
- Arc
- command palettes
- developer tools

Avoid:

- giant gradients
- inner shadows
- glassmorphism as decoration
- excessive cards
- oversized marketing heroes
- ornamental dashboards
- motion without information value

### Color tokens

```text
Brand       #2468F2
Brand Deep  #174FCB
Brand Soft  #EAF1FF
Brand Pale  #F5F8FF

Warm White  #FCFCF8
Ink         #252525
Gray        #7A7A7A
```

Use approximately:

```text
80% neutral
15% supporting surfaces
5% brand/accent
```

Cobalt communicates:

- selection
- primary action
- focus
- navigation state
- small product accents

It should not flood the page.

### Typography

Preferred family:

```text
SF Pro / system UI fallback
```

Core scale:

```text
12 / 13 / 14 / 16 / 18 / 24
```

Larger display sizes are allowed for the homepage title only.

Prefer compact, readable working interfaces over oversized type.

### Shape and elevation

- default border radius: 8–12px
- larger workspace containers: up to 16px
- use borders before shadows
- shadows should be rare and subtle
- command palette/modal may use stronger elevation

---

## 12. UI Component Strategy

### Styling

Tailwind CSS v4 is the only default styling system for application UI.

Use:

- Tailwind utility classes in Svelte markup
- `@theme` in `src/app.css` for Module design tokens
- minimal global/base CSS only when it cannot be expressed meaningfully as component utilities

Do not add component-specific `<style>` blocks or recreate a parallel CSS component system unless a concrete limitation requires it.

### Component sourcing

**Library-first. Do not hand-roll generic UI primitives.**

Before building a reusable primitive, search the component sources in this order:

1. shadcn-svelte
2. Bits UI
3. an existing reusable component already in this repository
4. native HTML when it is already the correct accessible primitive

Examples that should come from a library when needed:

- button behavior
- dialog
- drawer / sheet
- command palette
- dropdown / context menu
- tooltip
- popover
- switch
- checkbox / radio
- tabs
- select / combobox
- slider
- file dropzone behavior
- toast
- progress
- accessible overlay/focus-management primitives

App-specific composition is still owned by Module.

Good reusable app components include:

- `AppHeader`
- `ToolHeader`
- `CategoryPage`
- future `ToolCard`, `ToolWorkspace`, or archetype-specific compositions when repetition is real

Do not create wrappers merely to rename a library component. Wrap only when Module adds stable product behavior, semantics, or design-system defaults.

### Arc / UIArc compatibility

Arc UI (`uiarc.dev`) is a design/component reference we want to follow where useful, but its official registry currently requires **React 19** and installs TSX/CSS-module components through the shadcn CLI.

Module remains a SvelteKit application.

Therefore:

- do not copy React Arc components into Svelte files
- do not manually port Arc components to Svelte just to match the library
- use Arc as visual/interaction reference where useful
- use shadcn-svelte / Bits UI for the Svelte implementation
- if Arc adds official Svelte support later, reevaluate and prefer the official implementation rather than a local port

Configured Svelte component registry:

```text
components.json
→ shadcn-svelte
→ Bits UI primitives underneath where applicable
```

References:

- https://uiarc.dev/docs/installation
- https://www.shadcn-svelte.com/docs/installation/sveltekit
- https://bits-ui.com/docs/getting-started

---

## 13. Interaction Principles

### Primary action

Each module should have one obvious next action.

Examples:

- Merge PDF
- Extract pages
- Format
- Generate
- Start

Do not create multiple visually equal calls to action without need.

### Feedback

Long-running tasks should expose only useful states:

```text
idle → processing → result
             ↘ error
```

Add progress/cancel only when the operation is long enough to justify them.

### Motion

Motion communicates:

- state transition
- spatial continuity
- loading/progress
- opening/closing overlays

Do not animate decoration for its own sake.

Honor reduced-motion preferences.

---

## 14. Privacy UX

Local-first is a product contract, not marketing copy.

For local modules, the intended path is:

```text
user data/file
      ↓
browser memory / worker / optional OPFS
      ↓
result
```

not:

```text
user data/file
      ↓
server/API
      ↓
result
```

UI claims must match network behavior.

Preferred compact copy:

> Processed locally on this device.

Do not imply that local storage is permanent cloud backup.

Storage settings should communicate:

> Stored on this device. Export a backup for important data.

---

## 15. Storage Model

Use storage according to state type.

```text
transient UI state
      ↓
Svelte memory/state

structured persistent state
      ↓
IndexedDB via Dexie

large temporary file workspace
      ↓
File objects / OPFS when justified

application assets
      ↓
Service Worker / Cache Storage
```

Do not persist everything.

Persist only state that has user value after reload/reopen.

---

## 16. Engineering Architecture

Primary boundary:

```text
Cloudflare = distribution
Browser    = application runtime
```

Target stack:

- Svelte / SvelteKit
- TypeScript
- Tailwind CSS
- pnpm
- Dexie + IndexedDB
- OPFS when justified
- Web Workers for CPU-heavy work
- Service Worker / Cache Storage for offline assets
- pdf-lib for PDF mutation
- PDF.js for PDF rendering/parsing
- Zod at runtime data boundaries
- Vitest
- Playwright
- Cloudflare Workers Static Assets

No required backend initially.

Do not add D1, R2, KV, auth, queues, or APIs without a concrete product requirement.

---

## 17. Rendering and Performance

Prefer static-first, client-interactive pages.

Known tool routes should be prerenderable where practical.

```text
build
  ↓
static route
  ↓
Cloudflare
  ↓
browser hydration
  ↓
local tool runtime
```

Performance priorities:

1. small initial shell
2. route/module code splitting
3. lazy-load heavy libraries
4. move CPU-heavy work off the UI thread
5. avoid unnecessary persistence writes
6. do not load tools the user did not request

A user opening Pomodoro must not download the PDF engine.

---

## 18. Dependency Direction

Required direction:

```text
routes/UI
   ↓
module
   ↓
platform
   ↓
browser APIs / external libraries
```

A module must not import another module's internals.

If two modules need the same capability, move the capability to a shared platform owner.

Examples:

- discovery metadata → registry
- persistence → platform/storage
- file helpers → platform/files
- worker protocol → platform/workers
- PWA/offline → platform/pwa
- reusable visual primitives → shared components

Route components should remain thin.

---

## 19. Initial Validation Modules

The first architecture should be proven against three different state shapes.

### Typing Practice

Validates:

- high-frequency interaction
- runtime-only state
- session summaries
- structured persistence

### Pomodoro

Validates:

- temporal state
- reload recovery
- background throttling correctness

Timer source of truth should be temporal facts:

```ts
{
  startedAt,
  duration,
  endsAt,
  status
}
```

not a decrementing counter.

### PDF

Validates:

- local files
- heavy dependencies
- Web Workers
- lazy loading
- export/download
- optional OPFS workspace

Do not expand to dozens of modules before these platform patterns are clean.

---

## 20. Responsive Model

Desktop prioritizes workspace efficiency.

Mobile prioritizes:

- one-column workflow
- large tap targets
- primary action visibility
- search access
- compact bottom navigation

Do not reproduce the desktop information density blindly on mobile.

Contextual desktop side navigation may disappear on mobile when breadcrumb + related tools are sufficient.

---

## 21. Accessibility Baseline

Every module should support:

- keyboard navigation for primary flows
- visible focus state
- semantic controls
- sensible labels
- readable contrast
- reduced motion
- responsive text/layout
- understandable errors

Do not encode important meaning with color alone.

---

## 22. Definition of Done — Product/UI

A module is product-complete when:

- the user can understand its job immediately
- direct URL access works
- the primary action is obvious
- no account is required for the core job
- relevant persistence survives reload
- heavy work does not freeze the UI
- privacy claims are technically true
- errors provide a recovery path
- mobile and keyboard flows are usable
- it fits an existing layout archetype or a new archetype is justified
- unrelated modules are not needed for it to work

---

## 23. Decision Rules

### Product

Ask:

```text
Does this reduce time-to-result
or improve trust/reliability
for the user's current task?
```

If not, it is probably not needed yet.

### Navigation

Ask:

```text
Is this global, browsable, or contextual?
```

Then use:

```text
global     → search/top shell
browsable  → category
contextual → local tool navigation / related tools
```

### Engineering

Before adding infrastructure, ask:

```text
What user-visible requirement cannot be satisfied
by the current browser-first architecture?
```

If there is no concrete answer, do not add the infrastructure.

---

## 24. Current Non-Goals

Do not add without an explicit product requirement:

- mandatory accounts
- cloud sync
- subscriptions
- collaboration
- server-side file processing
- social features
- plugin marketplace
- cross-device state
- monorepo structure
- speculative platform abstractions

Module should grow by adding coherent modules, not by accumulating infrastructure.
