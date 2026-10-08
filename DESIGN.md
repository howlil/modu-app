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

- keep the hero compact and use the shared Display token (36px / 40px) rather than an oversized billboard title
- supporting copy uses the Body token (16px / 24px)
- navigation, buttons, labels, and tool names use the same semantic typography as other routes
- hierarchy comes from type role, spacing, and restrained weight contrast (400 / 500 / 600), not custom 700–800 weights

Homepage atmosphere:

- hero uses a pale cobalt-to-warm-white atmosphere, soft blue glows, faint dot fields, and orbital curves inspired by the approved visual reference
- four translucent tool-themed panels and two icon chips are visual ornaments, not controls; the actual tool launcher remains the grid below
- desktop ornaments use the approved Organic arrangement: asymmetric offsets and mixed rotations, never mirrored card columns
- subtle independent vertical drift is enabled by default for floating cards and chips; disable animation for reduced-motion preferences
- an understated white curved wave transitions the hero into the warm-white tool grid without a harsh section boundary
- keep the centered title, supporting copy, and Request feature dialog functional and legible above all decorative layers
- ornamental cards disappear on tablet/mobile widths; clip every decorative layer to prevent horizontal scrolling
- the scroll cue is a real anchor to the tool grid; motion effects must respect reduced-motion preferences
- do not add a separate Tools heading/count row when the launcher grid is self-explanatory

Home tool presentation:

- Merge PDF remains unavailable until a tested local PDF merge engine is implemented. Its launcher tile must be visibly noninteractive with a Coming soon status, and the route must not expose dead file controls.

- tools render as compact square app tiles
- each tile is 1:1 with a clear icon and short name
- tiles may use distinct solid pastel surfaces to make each tool feel like an app
- each tile should have a distinct illustration/composition tied to the tool; do not reuse the same icon-box layout with only a different glyph
- use restrained light-to-dark color shifts, inset highlights, and soft shadows to create depth without glossy effects
- do not add descriptions inside the launcher grid
- tool grid should stay visually balanced for the current count: with four launcher cards, use 4 columns on wide screens and 2 columns below tablet width; avoid a single orphan card on a new row
- the tile itself is the interaction target; avoid extra arrows, badges, or metadata

Global navigation:

- the app header is a fixed overlay; it must not reserve a white block above the homepage hero
- at the top of the page, navigation is flat, transparent, and full-width within the normal content axis so it visually merges into the hero
- do not show an island/capsule surface before the page has scrolled past the initial header height
- after that threshold, navigation contracts into a narrower fully rounded floating capsule with visible top breathing room
- normal routes reserve the fixed header height at the layout level; the homepage cancels that space so the hero background starts at viewport y=0 while its content remains padded below the header
- use restrained glassmorphism only for the scrolled island state: translucent background, subtle border, backdrop blur, soft shadow
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
  status: 'available' | 'coming-soon';
};
```

The registry is the single owner of tool availability, including noninteractive
coming-soon tiles. Tool artwork stays inside ToolCard; do not create a dynamic
plugin framework for the current fixed catalog.

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
- Dialog
- Input
- Textarea
- Tabs
- Switch
- Toggle
- Toggle Group

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

### Typography and spacing foundations

Fonts use OS-native UI rendering; no bundled or downloaded font files.

```text
Sans   -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif
       macOS / iOS: SF Pro (system); Windows: Segoe UI
Mono   "SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace
```

Semantic text tokens are registered in `src/app.css` via Tailwind v4 `@theme inline`:

| Role | Utility | Size / line height |
| --- | --- | --- |
| Meta | `text-meta` | 12 / 16px |
| UI | `text-ui` | 14 / 20px |
| Body | `text-body` | 16 / 24px |
| Title | `text-title` | 18 / 24px |
| Title LG | `text-title-lg` | 20 / 28px |
| Page Title | `text-page-title` | 28 / 34px |
| Display | `text-display` | 36 / 40px |

- `src/app.css` explicitly registers `--font-weight-normal: 400`, `--font-weight-medium: 500`, and `--font-weight-semibold: 600` in Tailwind `@theme`; these are the only supported application font weights.
- Default page text is Body. Control labels generally use UI, secondary metadata uses Meta, view titles use Title or Title LG, module headings use Page Title, and hero heading uses Display.
- Never introduce arbitrary 9/10/11/13/15px text or 450/520/750 font weights as new application typography.
- Exceptions are functional visualization/data glyphs such as the oversized Pomodoro countdown, typing drill glyphs, and extremely dense keyboard diagram legends—not new general type styles.
- Use `font-sans` / `font-mono`; do not introduce font downloads or CSS font-face definitions.

Spacing derives from a 4px Tailwind base (`--spacing: 4px`). Approved application layout intervals:

```text
4px   p-1 / gap-1
8px   p-2 / gap-2
12px  p-3 / gap-3
16px  p-4 / gap-4
20px  p-5 / gap-5
24px  p-6 / gap-6
32px  p-8 / gap-8
```

- Combine these intervals rather than inventing 10/11/18/22px rhythm values for standard padding, gaps, and margins.
- Viewport geometry, control hit targets, page gutters, hairline details, the full-bleed homepage hero, and the fixed navigation height may use intentional exceptions (e.g. 10px mobile gutter, large countdown, tiny keyboard legends).
- Keep ordinary margins/paddings/gaps at 1/2/3/4/5/6/8 units and use the Tailwind semantic text utilities in route/components so typography stays centralized and can change without searching arbitrary pixels.

### Layout width

Use one shared horizontal rhythm across Module:

```text
global page shell   1180px
module content axis  860px
mobile gutters       10px
desktop gutters      16px
```

Rules:

- every module route uses the 1180px outer shell with the same horizontal padding
- title, primary navigation, and main module sections align to the 860px content axis
- narrower widths such as the Pomodoro timer's 680px focus area are allowed only as inner task composition, never as a different page width
- wider module sections must not escape the 860px axis merely because a view contains more data
- the homepage may use intentional hero-copy and launcher-grid widths, but it keeps the same global horizontal gutters
- avoid introducing one-off page max-width values without a product requirement

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

- Action buttons use fully rounded pill geometry by default through the shared shadcn `Button` primitive.
- Compact toggle actions may use the same pill geometry; structural rows, cards, fields, and visualization elements are not forced into pills.
- The global navigation becomes a fully rounded floating capsule after scroll and keeps visible top breathing room from the viewport edge.

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
- Pomodoro uses the same top hierarchy as Typing: ToolHeader title, then one compact fully rounded navigation bar
- Timer / Activity are pill tabs on the left of that bar; Settings stays aligned on the right and opens as a sibling in-page view, not a popup
- Activity and Settings content may widen for their needs without pulling the title/navigation axis off-center
- distinguish page-level navigation from timer-mode controls: Timer / Activity is the module navigation bar, while Focus / Short / Long remains a compact mode selector
- Timer follows the chosen minimal A design: frameless focus surface with only quiet top/bottom dividers, compact mode pills, oversized numeric countdown, subtle state text, cycle dots, and a small session/today summary; do not render a timer ring
- idle state should not show redundant `Ready` copy; state text appears only when it adds information such as Focus, Paused, Overtime, or Complete
- cycle copy must be semantically explicit, e.g. `Session 2 of 4`, and match the completed-dot state
- Reset and Skip are quiet icon-only shadcn Buttons with accessible labels, arranged in the same horizontal row immediately to the left and right of the primary Start/Pause/Resume action
- Sound, ringtone choice, notifications, auto-start behavior, overtime, Wake Lock, custom durations, Focus Protection, and data controls live in Settings rather than the primary timer surface
- Focus Protection is optional enforcement, not a separate productivity product: the user explicitly chooses blocked domains and the timer remains the core experience
- Focus Protection is active during Focus running, paused, and overtime states; it is released for idle, short/long breaks, Reset, and Skip
- website enforcement belongs to the Chromium companion extension; the Svelte app is only the control surface
- extension state must be explicit in UI: checking, requires extension, connected, active, or unavailable; never imply protection is active when enforcement failed
- blocked domains are normalized to hostnames, deduplicated, stored locally, and must never include the Module control surface
- use Manifest V3 declarativeNetRequest session rules for fresh top-level navigations, plus a webNavigation guard for SPA history-state route changes and a sweep of already-open blocked tabs when protection starts
- blocking a domain means every route on that domain and its subdomains; route-level SPA navigation must not bypass protection
- the extension must recover an active session after browser restart and discard stale protection safely
- extension failure must never stop or invalidate the Pomodoro timer
- the extension must not collect browsing history, page content, page titles, or visited URLs; only the blocklist and focus-session metadata are stored
- Settings apply immediately; do not require a separate Save action for these local preferences
- ringtone choices are short local procedural tones so completion audio remains license-free, offline-friendly, and consistent with the local-first contract
- Pomodoro data management is centralized in Settings: export produces one full JSON backup of timer state, preferences, goals, blocked-site configuration, and activity history; delete removes all locally stored Pomodoro data
- Activity is for inspection, not data administration; do not duplicate export/delete controls there
- destructive data deletion uses inline confirmation inside the existing Settings drill-down rather than opening another modal
- Pomodoro Settings is an in-page view; do not open it in a dialog or overlay
- nested settings such as Blocked websites, Ringtone, and Data use in-page drill-down navigation with an explicit Back action
- Escape may return from a nested settings drill-down to the main Settings view, but Settings itself behaves like normal page navigation
- scrollable surfaces may hide the visual scrollbar to preserve the quiet UI, but wheel, trackpad, touch, keyboard, and programmatic scrolling must remain functional
- the focus label is optional: show `+ Add focus` until the user chooses to add one, then allow lightweight inline editing
- overtime shows the elapsed extra time with a leading plus sign; do not reintroduce a circular progress ring
- keyboard shortcuts remain functional but should not be permanently explained on the primary surface
- keep the interface single-column, light-weight, and free of task-management or heavy analytics scope

## 7. Typing module contract

Typing is an adaptive muscle-memory trainer, not only a WPM test.

Core training loop:

```text
warm-up / retention
→ weak keys
→ weak transitions
→ mixed transfer
→ benchmark
→ learner model
→ next session adapts
```

Typing module contract:

- Train is the default surface; Lessons teaches movements and Test measures performance separately
- adaptive sessions use five compact blocks: 2m retention, 3m weak keys, 3m weak transitions, 3m mixed transfer, 1m benchmark
- training prioritizes accuracy before speed; WPM is supportive rather than the dominant live metric
- wrong keys do not advance by default so the practiced movement must be corrected before continuing
- the learner model stores aggregate per-key and per-transition attempts, accuracy, recent performance, and latency; do not persist raw keystroke event streams
- weak-key selection uses both error rate and latency rather than error count alone
- transition/bigram statistics identify slow sequences even when their individual keys are already stable
- mastery requires repeated evidence: default 98% accuracy, 20 samples, and ≤420ms average correct-key latency
- mastered keys enter a local retention queue with increasing review intervals; failed review returns the item to a near-term interval
- keyboard/finger guidance fades as practiced keys stabilize and can be manually reduced or hidden
- keyboard sound is optional, local, and procedural through Web Audio; no remote audio asset or license dependency is required
- the typing sound engine reuses one AudioContext instead of creating a new context for every keystroke
- typing sound favors a crisp, dry clacky keyboard profile: fast high-frequency contact tick, short keycap bottom-out snap, restrained low body, and quieter top-out release; Space stays lower/heavier and wrong keys retain a subtly brighter impact
- key sounds must resume suspended browser AudioContexts from a real user gesture, play the pending first strike only after resume succeeds, and avoid unhandled resume rejections or delayed bursts
- Typing Settings includes a small Preview action to verify sound output without starting a training run
- Test mode records performance history but must not update key mastery or adaptive weakness
- custom/test text must never influence the adaptive learner model
- Progress shows only actionable signals: recent performance, weak keys/transitions, and due review
- all learning state and preferences stay local to the browser; no account is required
- keep the primary training surface focused: current block, text, accuracy, target, restrained WPM, keyboard guide, and session progress
- do not turn Typing into an XP, streak, achievement, or analytics dashboard

## 8. Local-first contract

```text
user input/file
      ↓
browser
      ↓
result
```

Do not send user content to APIs, analytics, logs, or third parties unless the product explicitly changes that contract.

Do not claim offline support until it is implemented and tested.

## 9. Engineering boundary

```text
routes/UI
   ↓
module logic
   ↓
browser APIs / required libraries
```

Do not create platform abstractions before a concrete requirement needs them.

The small Module Registry remains because Home already consumes shared metadata.

## 10. Deployment

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

## 11. Definition of done

A module is done when its core job works, privacy copy matches reality, errors are recoverable, mobile/keyboard basics work, relevant deterministic logic is tested, and build/check passes.

UI work is complete only when generic controls use shadcn-svelte instead of unnecessary bespoke primitives.

## 12. Decision rule

```text
What current user-visible requirement needs this?
```

If there is no concrete answer, do not add it yet.
