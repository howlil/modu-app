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

Homepage typography:

- keep the hero compact rather than billboard-sized
- hero title should usually stay around 42–64px, using medium/regular weight rather than bold display weight
- supporting copy stays around 14–16px with normal weight
- navigation, buttons, labels, and tool names should avoid heavy bold weights unless hierarchy truly requires it
- prefer weight contrast through spacing and scale before using 700–800 weights

Homepage atmosphere:

- hero uses the semantic primary cobalt as a restrained top-to-bottom field rather than an unrelated decorative color
- the blue field dissolves into the warm-white page through large, soft cloud-like white forms; the cloud treatment should feel editorial and atmospheric, not cartoonish
- the cloud transition must resolve fully into the normal page background before the tool grid
- do not add a separate Tools heading/count row when the launcher grid is self-explanatory

Home tool presentation:

- tools render as compact square app tiles
- each tile is 1:1 with a clear icon and short name
- tiles may use distinct solid pastel surfaces to make each tool feel like an app
- each tile should have a distinct illustration/composition tied to the tool; do not reuse the same icon-box layout with only a different glyph
- use restrained light-to-dark color shifts, inset highlights, and soft shadows to create depth without glossy effects
- do not add descriptions inside the launcher grid
- tool grid should stay visually balanced for the current count: with four launcher cards, use 4 columns on wide screens and 2 columns below tablet width; avoid a single orphan card on a new row
- the tile itself is the interaction target; avoid extra arrows, badges, or metadata

Scrolled navigation:

- at the top of the page, navigation spans the normal content width and stays transparent so it visually merges with the hero
- do not show a default navbar border, fill, or blur before scrolling
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

Icon rule:

- Lucide is the default icon source for UI actions, controls, and simple tool symbolism
- do not hand-draw an SVG when an equivalent Lucide icon exists
- custom illustration is allowed only when the composition itself carries product meaning beyond a single icon

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

- loud or decorative gradients; restrained gradients are allowed only when they add depth or hierarchy
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

## 6. Pomodoro module contract

Pomodoro is a focused single-column tool, not a productivity dashboard.

Core flow:

```text
choose mode
→ start
→ stay focused
→ pause/resume if needed
→ complete
→ continue to the correct break/focus mode
```

Pomodoro module contract:

- Focus defaults to 25 minutes, short break to 5, long break to 15
- running time derives from an absolute `endsAt`; never rely on a decrement-only counter
- pause stores exact remaining time and resume derives a new `endsAt`
- running sessions recover correctly after tab sleep, backgrounding, refresh, and reopen
- timer state, cycle progress, durations, sound/notification preferences, and optional focus label persist locally
- browser title shows countdown while running/paused and completion state when finished
- 4 completed focus sessions lead to a long break; completing the long break resets the cycle
- primary action is state-driven: Start → Pause → Resume → Start break/focus
- Reset and Skip remain secondary controls
- sound and browser notifications are opt-in controls; notification permission is requested only after explicit user action
- custom durations stay behind settings so the primary timer remains visually quiet
- optional auto-start breaks and auto-start focus live in settings
- overtime is available for focus sessions; it counts upward after the scheduled focus target and remains mutually exclusive with auto-start breaks
- optional Screen Wake Lock keeps the display awake only while an active session is running and only on supported browsers
- completed focus sessions are stored locally as Activity history; the timer surface exposes only a quiet Today summary
- growing Activity history uses IndexedDB while active timer state and preferences stay in localStorage
- Activity includes daily focus target, 52-week goal-relative heatmap, weekly summary, recent sessions, day inspection, and local JSON/CSV export
- heatmap intensity is based on focused time relative to the goal that applied to that day, not raw Pomodoro count
- history stays local and intentionally lightweight rather than becoming a productivity-score dashboard
- progressive disclosure is mandatory: the primary Timer surface shows mode, timer, primary action, cycle, optional focus label, and quiet Today activity only
- Timer / Activity navigation shares one centered visual axis with the Pomodoro title; Activity content may widen for data density without pulling the header off-center
- distinguish page-level navigation from timer-mode controls: Timer / Activity uses quiet text tabs with an active underline, while Focus / Short / Long remains a compact segmented control
- keep Settings within the compact Pomodoro header axis rather than floating at the edge of the wider Activity container
- the timer ring is supportive, not the hero: keep it compact with a thin stroke so the time value remains the strongest visual element
- idle state should not show redundant `Ready` copy; state text appears only when it adds information such as Focus, Paused, Overtime, or Complete
- cycle copy must be semantically explicit, e.g. `Session 2 of 4`, and match the completed-dot state
- Reset and Skip use quiet icon controls around the primary Start/Pause/Resume action
- Sound, notifications, auto-start behavior, overtime, Wake Lock, and custom durations live in Settings rather than the primary timer surface
- Settings apply immediately; do not require a separate Save action for these local preferences
- the focus label is optional: show `+ Add focus` until the user chooses to add one, then allow lightweight inline editing
- overtime keeps the progress ring visually complete while elapsed overtime counts upward
- keyboard shortcuts remain functional but should not be permanently explained on the primary surface
- keep the interface single-column, light-weight, and free of task-management or heavy analytics scope

## 7. Local-first contract

```text
user input/file
      ↓
browser
      ↓
result
```

Do not send user content to APIs, analytics, logs, or third parties unless the product explicitly changes that contract.

Do not claim offline support until it is implemented and tested.

## 8. Engineering boundary

```text
routes/UI
   ↓
module logic
   ↓
browser APIs / required libraries
```

Do not create platform abstractions before a concrete requirement needs them.

The small Module Registry remains because Home already consumes shared metadata.

## 9. Deployment

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

## 10. Definition of done

A module is done when its core job works, privacy copy matches reality, errors are recoverable, mobile/keyboard basics work, relevant deterministic logic is tested, and build/check passes.

UI work is complete only when generic controls use shadcn-svelte instead of unnecessary bespoke primitives.

## 11. Decision rule

```text
What current user-visible requirement needs this?
```

If there is no concrete answer, do not add it yet.
