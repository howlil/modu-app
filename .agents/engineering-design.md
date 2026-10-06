# Module — Engineering Design

## 1. Engineering Goal

Build Module as a **local-first browser platform** whose utilities are independent modules.

Primary architecture:

```text
Cloudflare = distribution
Browser    = application runtime
```

The browser owns:

- computation
- local state
- file processing
- persistence
- offline behavior

Avoid adding backend infrastructure without a concrete requirement.

---

## 2. Stack

Core:

- Svelte
- SvelteKit
- TypeScript
- Tailwind CSS
- pnpm

Local platform:

- Dexie over IndexedDB for structured persistent state
- OPFS when filesystem-style access is beneficial for large working files
- Web Workers for CPU-heavy operations
- Service Worker / Cache Storage for offline application assets

File tooling:

- pdf-lib for PDF mutation
- PDF.js for PDF parsing/rendering where required

Quality:

- Zod for runtime validation at data boundaries
- Vitest for unit/integration tests
- Playwright for browser/E2E behavior

Deployment:

- Cloudflare Workers Static Assets
- no required application backend initially

---

## 3. System Architecture

```text
                    Cloudflare Edge
                          │
                    static assets
                          │
                          ▼
┌──────────────────────────────────────────────┐
│                   Browser                    │
│                                              │
│                SvelteKit Shell               │
│                       │                      │
│                Module Registry               │
│                       │                      │
│          ┌────────────┼────────────┐         │
│          ▼            ▼            ▼         │
│       Typing       Pomodoro       PDF        │
│                                      │       │
│                                  Worker      │
│                                              │
├──────────────────────────────────────────────┤
│                Local Platform                │
│                                              │
│     IndexedDB       OPFS       Cache API     │
│                                              │
└──────────────────────────────────────────────┘
```

Do not introduce D1, R2, KV, authentication, queues, or server APIs until a product requirement needs them.

---

## 4. Rendering Strategy

Prefer **static-first, client-interactive** pages.

Known utility routes should be prerenderable where practical so that:

- direct URLs return useful HTML
- metadata/SEO works
- Cloudflare can serve the page as a static asset
- interactive logic activates in the browser

Mental model:

```text
build
  ↓
prerender route
  ↓
static HTML + JS chunk
  ↓
Cloudflare
  ↓
browser hydrates tool
```

Do not turn the whole product into a server-rendered application without need.

---

## 5. Dependency Direction

The required dependency direction is:

```text
modules
   ↓
platform
   ↓
browser APIs / libraries
```

A module must not depend on another module.

Bad:

```text
image → pdf internals
typing → pomodoro state
```

If multiple modules need the same capability, move that capability into the platform layer.

Examples:

- file helpers → platform/files
- persistence helpers → platform/storage
- worker messaging → platform/workers
- common UI primitives → components
- module discovery metadata → registry

---

## 6. Proposed Project Structure

```text
src/
├── routes/
│   ├── +layout.svelte
│   ├── +page.svelte
│   ├── typing/
│   ├── pomodoro/
│   ├── pdf/
│   │   ├── merge/
│   │   ├── split/
│   │   └── rotate/
│   └── settings/
│
├── lib/
│   ├── platform/
│   │   ├── registry/
│   │   ├── storage/
│   │   ├── files/
│   │   ├── workers/
│   │   └── pwa/
│   │
│   ├── modules/
│   │   ├── typing/
│   │   ├── pomodoro/
│   │   └── pdf/
│   │
│   ├── components/
│   └── db/
│
└── service-worker.*
```

Keep route files thin.

Domain behavior belongs in `lib/modules/*`, not inside large route components.

Do not create a monorepo until there is a real second consumer such as a browser extension or desktop app.

---

## 7. Module Registry

Every utility must register a single source of metadata.

Example shape:

```ts
type ModuleDefinition = {
  id: string;
  name: string;
  description: string;
  route: string;
  category: ModuleCategory;
  keywords: string[];
  capabilities: ModuleCapability[];
};

type ModuleCapability =
  | 'storage'
  | 'files'
  | 'worker'
  | 'offline';
```

The registry should drive:

- homepage discovery
- search
- categories
- command palette
- recent modules
- capability-aware UI

Do not duplicate module metadata across unrelated files.

---

## 8. State Ownership

Choose storage based on the nature of the state.

```text
transient UI state
        ↓
Svelte state / memory

structured persistent data
        ↓
IndexedDB via Dexie

large working files
        ↓
File objects / OPFS when needed

application assets
        ↓
Service Worker / Cache Storage
```

Do not persist state just because persistence exists.

Persist only what must survive reload/reopen.

---

## 9. IndexedDB Rules

Use IndexedDB for structured user state such as:

- settings
- recent modules
- favorites
- typing session summaries
- pomodoro history
- module-specific preferences

Do not write to IndexedDB on every high-frequency UI event when a session-level write is enough.

Example:

```text
typing keystrokes
      ↓
memory
      ↓
session ends
      ↓
summary persisted
```

Treat IndexedDB schema as production data.

Schema changes require migrations. Never solve schema evolution by dropping user databases.

---

## 10. OPFS Rules

OPFS is a workspace, not the default place for every file.

Use direct in-memory/File processing when reasonable.

```text
small operation
File → Worker → Result → Download
```

Use OPFS when it materially improves large or multi-step workflows:

```text
large file
   ↓
OPFS workspace
   ↓
Worker processing
   ↓
result
   ↓
export
```

Delete temporary working files when they are no longer needed.

---

## 11. Web Worker Rules

Heavy processing must not block the UI thread.

Worker candidates:

- PDF manipulation
- PDF rendering/analysis
- image encoding/compression
- expensive transforms
- large parsing jobs

Keep lightweight interaction on the main thread.

Worker communication should use a small platform abstraction rather than custom ad-hoc message protocols in every module.

Worker operations should expose:

```text
request
progress
result
error
cancel
```

when the operation is long enough to justify them.

---

## 12. PDF Architecture

Initial PDF scope:

- merge
- split
- rotate
- reorder
- delete pages
- PDF → image
- image → PDF

Preferred flow:

```text
Svelte UI
   ↓
PDF worker
   ↓
pdf-lib / PDF.js
   ↓
Blob/File result
   ↓
download/export
```

PDF libraries must be lazy-loaded with the PDF routes/features.

A user opening Pomodoro must not download the PDF engine.

Avoid high-fidelity Office document conversion in the initial architecture.

---

## 13. Pomodoro State Model

Do not make a decrementing UI counter the source of truth.

Persist temporal facts:

```ts
{
  startedAt,
  duration,
  endsAt,
  status
}
```

Derive remaining time:

```ts
remaining = endsAt - Date.now();
```

This makes the timer resilient to:

- background tab throttling
- reload
- temporary suspension
- reopening the application

---

## 14. Typing State Model

High-frequency typing state stays in memory.

Persist session summaries, not every keystroke.

Example:

```ts
type TypingSession = {
  id: string;
  startedAt: number;
  durationMs: number;
  wpm: number;
  accuracy: number;
  correctChars: number;
  wrongChars: number;
  mode: string;
};
```

Keep calculation logic outside UI components so it can be unit tested.

---

## 15. Lazy Loading

Heavy capabilities must load only when required.

Expected behavior:

```text
visit /
  ↓
shell + homepage

visit /typing
  ↓
typing code

visit /pdf/merge
  ↓
PDF module
  ↓
PDF dependencies
```

Do not create a global barrel/import pattern that accidentally pulls every module into the initial bundle.

Bundle boundaries are part of the architecture.

---

## 16. Offline Strategy

The application shell and lightweight assets should be cacheable.

Prefer:

```text
core shell        → precache
small modules     → cache/precache as appropriate
heavy engines     → cache after first use
user data         → IndexedDB/OPFS, never Cache API
```

Offline claims must be specific.

A module that has never downloaded its heavy assets may require a first online load.

---

## 17. Privacy and Network Boundary

For local tools, user content must not cross the network boundary.

A local processing path should look like:

```text
user file
   ↓
browser / worker / optional OPFS
   ↓
result
```

not:

```text
user file
   ↓
Cloudflare/API
   ↓
processing
```

Tests should be able to verify that local-only workflows do not issue content-upload network requests.

---

## 18. Backup and Import

Local-first storage needs an explicit portability path.

Export format should include version metadata:

```ts
{
  backupFormatVersion,
  exportedAt,
  appVersion,
  data
}
```

Import flow:

```text
file
 ↓
validate
 ↓
migrate if necessary
 ↓
write transactionally
```

Never import unvalidated arbitrary data directly into IndexedDB.

---

## 19. Testing Strategy

Use the smallest test layer that proves the behavior.

### Unit

Test:

- calculations
- parsers
- temporal logic
- module domain rules

### Integration

Test:

- IndexedDB repositories
- migrations
- worker protocols
- file transformations

### E2E

Use Playwright for critical browser behavior:

```text
write state → reload → state survives
```

```text
load app → go offline → reload → supported tools still work
```

```text
select file → process → correct output
```

```text
local workflow → no content upload
```

Do not pursue test count. Test architectural promises.

---

## 20. Error Handling

Errors should be actionable and scoped to the module.

Prefer:

> This PDF could not be parsed. Try another file.

over:

> Unknown error.

Long operations should support visible progress when useful.

Recoverable failures must not corrupt persistent state.

---

## 21. Performance Rules

Performance priorities:

1. small initial shell
2. route/module code splitting
3. lazy heavy libraries
4. no heavy work on UI thread
5. avoid unnecessary persistent writes
6. avoid loading modules the user did not request

Do not optimize small microbenchmarks while shipping a multi-megabyte unnecessary initial bundle.

---

## 22. Future Backend Boundary

If future requirements introduce accounts or sync, preserve local-first ownership.

Preferred direction:

```text
local database
      ↓
sync adapter
      ↓
Cloudflare Worker
   ┌──────┴──────┐
   ▼             ▼
  D1             R2
metadata        blobs
```

The server should initially act as sync/replication infrastructure, not become required for every interaction.

---

## 23. Engineering Definition of Done

A module is technically complete when:

- domain behavior is separated from presentation
- dependencies point toward platform, never another module
- heavy code is lazy-loaded
- expensive work does not block the main thread
- persistence is used only where needed
- schema changes include migrations
- direct route navigation works
- privacy claims match network behavior
- failure states are recoverable
- critical architectural behavior has tests
- unrelated modules can be removed without breaking it

---

## 24. Engineering Decision Rule

Before adding infrastructure, ask:

```text
What user-visible requirement cannot be satisfied
by the current browser-first architecture?
```

If there is no concrete answer, do not add the infrastructure.
