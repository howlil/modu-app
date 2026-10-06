# AGENTS.md

## Purpose

This file defines how coding agents work in this repository.

Optimize for:

- fast lead time
- low defects
- small coherent changes
- clean ownership and boundaries
- proportional verification
- low process noise

Do not turn the workflow into ceremony.

---

## 1. Source of Truth

Before changing code, read only the minimum relevant context.

Order:

1. the user's current request and acceptance criteria
2. this `AGENTS.md` for working policy
3. `DESIGN.md` for canonical product, UI, and architecture decisions
4. `.agents/product-design.md` when product scope/behavior is unclear
5. `.agents/engineering-design.md` when ownership, storage, workers, boundaries, or architecture matter
6. existing code and tests for established implementation patterns

Do not create persistent per-task plan documents.

Use temporary planning in the working session only.

If code and `DESIGN.md` disagree on a material decision touched by the task, do not silently invent a new direction.

---

## 2. Canonical Workflow

Default:

```text
UNDERSTAND
   ↓
MODEL ONLY WHAT MATTERS
   ↓
IMPLEMENT ONE SMALL VERTICAL SLICE
   ↓
VERIFY ACTUAL RISK
   ↓
INSPECT DIFF
   ↓
STOP / SHIP
```

Expanded:

```text
request
  ↓
read minimum relevant context
  ↓
identify observable outcome
  ↓
identify affected owner/boundary
  ↓
make smallest useful plan
  ↓
implement smallest coherent change
  ↓
run targeted verification
  ↓
fix failures
  ↓
run broader gate only when justified
  ↓
inspect actual diff
  ↓
report evidence and stop
```

Do not keep expanding scope after the requested outcome is complete.

---

## 3. Product Impact Gate

Before implementing, ask:

```text
Does this change user-visible behavior,
scope, interaction, acceptance,
or the product's local-first/privacy contract?
```

If **no**, execute directly using existing patterns.

If **yes**, check `DESIGN.md` first.

Use `.agents/product-design.md` only when a meaningful product decision remains unresolved.

Do not perform full product-design analysis for trivial UI polish, copy correction, or implementation-only changes whose intended behavior is already clear.

---

## 4. Engineering Design Gate

Use engineering-design reasoning only when the task changes or creates a meaningful boundary such as:

- ownership
- module boundaries
- state model
- persistence
- IndexedDB schema/migration
- OPFS usage
- worker protocol
- public contract
- external integration
- privacy/network boundary
- rendering/deployment model
- failure guarantees

For ordinary implementation inside an established boundary, follow the existing design and implement directly.

---

## 5. Scope Control

Prefer the smallest coherent vertical slice that produces an observable outcome.

Do:

- change only files required by the behavior
- reuse existing owners and patterns
- include necessary tests/wiring in the same slice
- remove a superseded path when the task explicitly replaces it
- keep unrelated user changes intact

Do not:

- perform speculative refactors
- introduce abstractions for hypothetical future tools
- add dependencies without need
- redesign neighboring features
- rewrite working code for style preference
- add unrelated tests
- add unrelated documentation
- create a monorepo without a real second consumer
- add backend infrastructure without a product requirement

One rule should have one canonical owner.

---

## 6. Module Architecture Rules

Respect `DESIGN.md`.

Required dependency direction:

```text
routes/UI
   ↓
module
   ↓
platform
   ↓
browser APIs / libraries
```

Rules:

- modules do not depend on other module internals
- route components stay thin
- reusable capabilities belong to the platform/shared owner
- discovery metadata belongs to the Module Registry
- heavy module dependencies remain lazy-loaded
- CPU-heavy operations must not block the UI thread
- user content for local modules must not cross the network boundary
- persistence exists only when it adds user value

Do not bypass these boundaries just to make a local change faster.

---

## 7. UI / Product Rules

Global navigation model:

```text
search = primary navigation
category = browsing
context = local navigation
```

Do not add a permanent all-tools sidebar.

When adding a module:

1. map it to an existing layout archetype first
2. register its metadata once
3. keep its workspace focused on the user job
4. expose related tools contextually, not as global clutter

Layout archetypes:

- file transform
- text transform
- generator
- focus / continuous interaction

Visual rules:

- use the tokens and hierarchy in `DESIGN.md`
- warm white + ink + restrained cobalt
- borders before shadows
- no inner shadows
- no decorative gradients
- no card spam
- motion only when it explains state/continuity
- functional hierarchy beats decoration

---

## 8. Local-First / Privacy Rules

For local modules, intended data flow is:

```text
user input/file
      ↓
browser memory / worker / optional OPFS
      ↓
result
```

Do not send local-module user content to:

- analytics
- logs
- error reporting
- Cloudflare Worker endpoints
- third-party APIs

unless the user-visible feature explicitly requires it and the product contract is updated.

Do not log:

- file content
- typed content
- document content
- image content
- sensitive derived content

Privacy copy must match actual behavior.

---

## 9. State Ownership

Use the cheapest correct owner.

```text
transient UI state
  → Svelte memory/state

structured persistent state
  → IndexedDB via Dexie

large working files
  → File objects / OPFS when justified

application assets
  → Service Worker / Cache Storage
```

Do not persist high-frequency transient state without need.

Treat IndexedDB schema as production user data.

Schema changes require migrations.

Never solve schema evolution by dropping user data.

---

## 10. TDD Policy

TDD is the default for **observable deterministic behavior**, not a universal ritual.

Use:

```text
RED
  ↓
confirm the test fails for the intended reason
  ↓
GREEN with the minimum implementation
  ↓
REFACTOR if useful
```

Use test-first especially for:

- business/domain rules
- state transitions
- timer semantics
- parsers/formatters
- storage behavior
- migrations
- worker protocols
- regressions/bug fixes
- privacy/network invariants
- deterministic file transformations where a faithful fixture is practical

For bug fixes:

1. reproduce the bug
2. write the smallest failing regression test when a faithful automated boundary exists
3. confirm failure
4. implement the fix
5. confirm green

Do **not** force TDD for:

- CSS-only work
- visual spacing
- copy/docs
- generated files
- trivial wiring
- config-only edits
- pure file moves

Do not write tests that only mirror framework implementation details.

---

## 11. Verification Strategy

Verify actual risk, not ritual.

Use the smallest faithful boundary first.

### Domain logic

Run focused unit tests.

### Storage / workers / module boundaries

Run focused integration tests.

### Browser behavior

Use Playwright for critical journeys such as:

```text
write state → reload → state survives
```

```text
load supported tool → offline → reload → still works
```

```text
select file → process → correct output
```

```text
local workflow → no content upload
```

### Significant changes

When justified, additionally run:

- relevant tests
- typecheck
- lint
- build

Do not run the entire suite after every tiny edit.

Before completion, inspect the actual diff.

Never claim a skipped or failing check passed.

---

## 12. Refactoring Rules

Refactor when it removes a concrete risk or clarifies an ownership boundary required by the current task.

Prefer refactoring in this order when necessary:

```text
domain
  ↓
persistence/platform
  ↓
application/module orchestration
  ↓
UI
```

Do not refactor because:

- a future tool might need it
- a pattern could theoretically be more generic
- abstraction looks cleaner in isolation

Duplicate a tiny implementation temporarily rather than creating the wrong shared abstraction.

Extract when the shared ownership is real.

---

## 13. Dependencies

Before adding a package, ask:

1. Can the platform/browser already do this safely?
2. Is the dependency materially better than a small local implementation?
3. Does it affect initial bundle size?
4. Can it be lazy-loaded with the module?
5. Does it change privacy, network, or runtime guarantees?

Heavy dependencies must remain behind module/route boundaries.

Do not update unrelated dependencies as part of feature work.

---

## 14. Git Workflow

Keep Git low-noise.

Preferred model:

```text
main stays green
  ↓
one short-lived feat/ fix/ refactor branch when a branch is needed
  ↓
one small observable behavior
  ↓
verification
  ↓
squash merge
```

Principles:

- one active feature WIP per repo where practical
- small coherent changes
- no mega-PRs
- no long-lived branches
- commit count is secondary to coherent scope and verification

Agents must **not** automatically commit, push, open PRs, merge, or release unless the user explicitly asks.

When explicitly asked to commit, make the commit represent a logical outcome, not an arbitrary checkpoint.

---

## 15. Documentation

Update documentation only when the implementation changes a durable contract.

Update `DESIGN.md` when changing:

- product navigation model
- layout archetypes
- design tokens
- module architecture
- storage ownership
- privacy/network contract
- rendering/deployment architecture
- major platform invariants

Do not update docs for ordinary implementation details that remain within the existing contract.

Do not create milestone/status documents automatically.

---

## 16. Material Decisions

Do not silently change these without explicit user intent:

- product scope
- user-visible semantics
- public contracts
- storage format with migration impact
- architecture ownership
- privacy/network boundary
- security model
- server/backend requirement
- account requirement
- destructive data behavior

If a material decision blocks the task, surface the narrow decision rather than broadening the project.

For non-material ambiguity, make the smallest reasonable choice and continue.

---

## 17. Completion Contract

Before saying a task is complete:

1. confirm the requested observable outcome exists
2. confirm no unrelated scope slipped in
3. run the minimum-sufficient verification
4. inspect the diff
5. check that local-first/privacy constraints still hold when relevant
6. report only evidence actually observed

Completion report should be concise:

```text
Changed:
- ...

Verified:
- ...

Remaining risk / not run:
- ... only if relevant
```

Do not produce a retrospective unless asked.

---

## 18. Stop Rule

Stop when:

- the requested behavior works
- architecture boundaries remain valid
- relevant verification passes
- the diff is coherent
- no known material risk is being hidden

Do not continue polishing neighboring code after the outcome is complete.

The default goal is:

> smallest correct change, proven at the cheapest faithful boundary.
