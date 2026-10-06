# Module — Product Design

## 1. Product Thesis

**Module is a local-first collection of useful browser tools.**

The product exists to help users complete small, concrete tasks immediately without installing software, creating an account, or uploading private data to a server.

Core flow:

```text
intent → open tool → do task locally → get result → leave
```

Optimize for **time-to-result**, not time-in-app.

---

## 2. Product Promise

Every Module tool should aim to be:

- **Instant** — usable immediately with minimal setup.
- **Local-first** — primary computation and state live on the user's device.
- **Private** — user files/content are not uploaded unless a future feature explicitly requires and communicates it.
- **Persistent when useful** — preferences, sessions, and history survive reloads.
- **Offline-capable when practical** — previously loaded lightweight tools should continue to work without a network.
- **Focused** — one tool should solve one clear user job.

Do not require an account for core utilities.

---

## 3. Product Mental Model

```text
Module
│
├── Typing Practice
├── Pomodoro
├── Merge PDF
├── Split PDF
├── Compress Image
├── Format JSON
└── future modules
```

Module is the platform.

Each utility is an independent **module** with one job.

A module is not just a route or card. It is a complete user task with its own domain logic, UI, persistence needs, and success state.

---

## 4. User Job

Users do not come to “use Module.”

They come with an intent:

- merge PDFs
- practice typing
- start a focus timer
- resize an image
- format JSON
- generate a UUID

The product should reduce the distance between intent and result.

Bad:

```text
intent → dashboard → category → setup → tool → result
```

Preferred:

```text
intent → tool → result
```

---

## 5. Module Inclusion Test

Add a utility only when most of these are true:

1. It solves a concrete recurring task.
2. It can run primarily in the browser.
3. Local execution improves privacy, speed, cost, or reliability.
4. The user can understand the result quickly.
5. It does not require an account to be useful.
6. It fits the interaction model of Module without adding platform complexity disproportionate to its value.

Good initial candidates:

- Typing Practice
- Pomodoro
- PDF merge/split/rotate/reorder
- Image resize/compress/convert
- JSON formatter
- Base64 tools
- UUID generator
- QR generator

Avoid early:

- cloud storage
- social/community features
- AI workloads that require expensive server inference
- high-fidelity DOCX/PPTX conversion
- tools that require permanent backend infrastructure only to perform the core job

---

## 6. Information Architecture

Keep navigation shallow.

```text
/
├── search
├── recent
├── popular
└── categories

/typing
/pomodoro

/pdf/merge
/pdf/split
/pdf/rotate
/pdf/to-image

/image/compress
/image/resize
/image/convert

/dev/json
/dev/base64
/dev/uuid

/settings
```

Prefer URLs that reflect the user's intent.

Good:

```text
/pdf/merge
/image/compress
/dev/json
```

Avoid:

```text
/tools?id=42
```

---

## 7. Home Experience

The homepage should behave like a launcher, not a SaaS dashboard.

Priority:

```text
search → recent modules → popular modules → categories
```

Primary interaction:

> “What do you want to do?”

Search should understand tool names, verbs, and common intent keywords.

Do not introduce heavy onboarding.

---

## 8. Tool Page Pattern

Every utility should have a predictable structure:

```text
Tool name
Short outcome-oriented description

Primary workspace

Primary action

Result / status

Local-processing note when relevant
```

Example:

```text
Merge PDF
Combine PDF files locally.

[ Drop files ]

file-a.pdf
file-b.pdf

[ Merge PDF ]

Processed locally on this device.
```

The tool itself is the main content. Avoid marketing blocks inside the work surface.

---

## 9. Visual Direction

Module should feel:

- quiet
- fast
- neutral
- precise
- lightweight
- tool-first

Reference qualities: Linear, Raycast, Arc, command palettes, developer tools.

Avoid:

- giant gradients
- excessive cards
- decorative dashboards
- oversized hero sections
- unnecessary animation
- visual effects that reduce information density or clarity

Use animation only when it communicates state or continuity.

---

## 10. Privacy Contract

For local tools, user content must stay local by default.

Do not send user content to:

- analytics
- logging
- error reporting
- Cloudflare Worker endpoints
- third-party APIs

This includes file contents and sensitive derived data.

If telemetry is introduced, measure product events rather than user content.

Good:

```text
tool_opened: pdf_merge
operation_completed: pdf_merge
duration_bucket: 1-5s
```

Avoid:

```text
filename
document contents
typed text
image contents
PDF metadata copied without need
```

UI copy must match actual engineering behavior.

---

## 11. Local Data UX

Users should understand that local-first storage is device-local, not permanent cloud backup.

Settings should eventually expose:

```text
Storage
├── usage
├── persistence status
├── export backup
├── import backup
└── clear local data
```

Do not imply that browser data can never be lost.

Preferred language:

> Stored on this device. Export a backup for important data.

---

## 12. Initial Product Scope

Build the platform against three module archetypes first.

### Typing Practice

Validates:

- high-frequency interaction
- session state
- session summaries
- structured persistence

### Pomodoro

Validates:

- temporal state
- reload recovery
- background-tab correctness
- notifications/offline behavior later

### PDF Tools

Validates:

- files
- heavy browser computation
- workers
- lazy-loaded dependencies
- download/export flows

These three are the architecture test suite for the product.

Do not expand to dozens of tools until these patterns are clean.

---

## 13. Product Non-Goals — Initial Stage

Not required for the first useful version:

- accounts
- cloud sync
- subscriptions
- collaboration
- server-side file processing
- social features
- plugin marketplace
- complex personalization
- cross-device state

Add them only after a concrete user need appears.

---

## 14. Module Definition of Done

A module is complete when:

- the core operation is correct
- the user can reach the task directly by URL
- the primary action is obvious
- it works without an account
- persistent state survives reload when relevant
- heavy work does not freeze the UI
- errors provide an understandable recovery action
- local/privacy claims are technically true
- mobile and keyboard interaction are usable
- relevant behavior is tested
- unrelated modules are not required for it to work

---

## 15. Product Decision Rule

When choosing between features or designs:

```text
Does this reduce time-to-result
or improve trust/reliability
for the user's current task?
```

If not, it is probably not needed yet.
