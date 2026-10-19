# Modu-app — Core Habit Tracker: Product & Engineering Design

Date: 2026-10-20
Status: Research / implementation-ready proposal (not implemented)
Target: `howlil/modu-app`, branch `master` as reviewed
Decision: standalone local-first Habit Tracker module; no auth, payments, reminders, integrations, sync, social, AI, mood, or focus timer.

## 0. Evidence and provenance

Verified competitor features: InnerGrow Habit Tracker lists Build & Quit Habits, flexible measurable goals, statistics, weekly/monthly/yearly reports, diary, focus, reminders, cloud sync, widgets and social features. This specification retains only habit tracking's core behavior; implementation semantics below are recommended decisions, not confirmed InnerGrow internals.
- https://apps.apple.com/id/app/habit-tracker/id1438388363?l=id
- https://intercom.help/habitify-app/en/articles/6113621-learn-about-streak-in-habitify
- https://intercom.help/habitify-app/en/articles/9728009-create-track-a-weekly-habit
- https://intercom.help/habitify-app/en/articles/12395893-good-habit-setting-repeat
- https://github.com/dmn-lrns/habittracker
- https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Basic_Terminology

Repo inspected:
- https://github.com/howlil/modu-app/blob/master/README.md
- https://github.com/howlil/modu-app/blob/master/AGENTS.md
- https://github.com/howlil/modu-app/blob/master/.agents/architecture.md
- https://github.com/howlil/modu-app/blob/master/DESIGN.md
- https://github.com/howlil/modu-app/blob/master/src/lib/platform/registry/modules.ts
- https://github.com/howlil/modu-app/blob/master/src/lib/modules/daily-execution/core/consistency.ts
- https://github.com/howlil/modu-app/blob/master/src/lib/modules/daily-execution/core/planning.ts
- https://github.com/howlil/modu-app/blob/master/src/lib/modules/daily-execution/adapters/persistence.ts

## 1. Product contract

### Problem
The user needs to define recurring personal behaviors, log progress with minimal friction, correct history, and understand consistency. Modu-app already provides Daily Execution for activities and Pomodoro for focus time, but not a generic habit tracker. Daily's existing `HabitDefinition` describes a single workstream-based focus-session consistency goal, not arbitrary habits; it remains unchanged.

### Actor
Single local browser user on one origin and one browser profile; no account concept, remote identity or collaboration.

### Core outcomes
- Can create, update, archive, and permanently delete multiple habits.
- Can distinguish positive habits (`BUILD`) and negative habits (`QUIT`).
- Can define explicit goal measurement and schedule.
- Can log/check off manually for applicable dates without login.
- Can inspect and correct historic entries.
- Can see accurate daily, weekly and monthly completion and streak reports.
- Behaves deterministically across reload, tab changes and local calendar boundaries.

### Non-goals (exclude entirely)
Authentication, profiles, multi-tenant, subscription, purchase, push/local reminders, custom notification sounds, Apple Health/fitness API, calendar API, cloud sync, provider login, group, leaderboard, friends, focus timer, AI coaching, wallpapers/quotes, mood/HRV, broad diary module, generic rules engine, microservices, CRDT, event broker. Habit log note is allowed because it is part of a check-in, not a diary domain. No cross-module Pomodoro or Daily integration in this phase.

### Success criteria (acceptance, not invented business KPIs)
- First habit can be created without registration or setup wizard.
- Main Today view clearly shows scheduled, met, remaining and progress for selected day.
- Recording is fast and updates the correct date and progress.
- Report figures match independently verified check-ins and schedule.
- Reload retains committed local data; storage failure never silently overwrites existing records.

## 2. Information architecture

Route: `/habit` or `/habits` (final naming chosen once in implementation; recommended `/habit` to match concise module routes).
Feature label: `Habit Tracker`.
Within one workspace, exactly 3 primary views:
1. `Today`: compact date navigation, summary, scheduled habits, quick check-in, add button.
2. `History`: calendar with per-date outcome markers, selected-date details, correction.
3. `Insights`: per-habit and all-habits consistency, current/longest streak, period metrics and trends.

Habit editor: one drawer or dialog opened contextually from Today/History; no fourth top-level app route.
Habit detail: contextual panel/drawer containing schedule, target, history, edit, archive/delete.

### Surfaces and interactions
- Header: tool name + Create habit.
- Date strip: move to past/present; future planned habits can be viewed read-only but cannot be completed in advance by default.
- Today summary: planned, met, remaining, completion percentage; skips may be excluded from eligible denominator depending on the decided skip policy (see rules).
- Habit row: icon/name, schedule/target label, current value/target, progress and relevant controls.
- Boolean BUILD: checked/uncheck action.
- Quantity/Duration BUILD: + preset increment, direct edit, decrement to floor zero.
- QUIT: explicit `Clean day` / `Lapse` marking; unmarked days remain unknown/pending.
- Non-scheduled day: not in Today due list; visible as muted on History with no missed status.
- Historical correction: select date, edit/clear check-in; recompute reports.
- Empty state: create first habit; no forced tutorial.
- Error state: show safe retry; never display a persisted success when transaction failed.
- Loading: skeleton or modest loading state only for IndexedDB opening/querying; avoid massive spinners.

### Accessibility & responsive
- Keyboard navigation, proper button names, input labels, semantic date controls and visible focus indicators.
- Touch targets sized appropriately; icon+color never sole state cue.
- 860px module content axis, responsive mobile gutters 10px; typography uses `text-meta`, `text-ui`, `text-body`, `text-title`, etc. Generic controls use existing shadcn-svelte components. No unnecessary ornament.

## 3. Core domain and boundaries

A single **Habit Tracking bounded context** with four internal capabilities; NOT four independent services or repo modules:

A. Habit Catalog & Lifecycle: owns identity/title/direction/appearance/order/state and creation/archive/delete.
B. Scheduling & Goal Policy: owns cadence, goal measurement, threshold, effective dates and versioned changes.
C. Check-in & Progress: owns date-scoped manual recorded facts and adjustments.
D. Insights: pure derived projections of A+B+C: period outcomes, streaks, daily summary, completion rate, heatmap.

Persistence is a technical adapter, not business domain. UI/controller likewise not a business domain.

Dependency contract:
`UI → per-mount Controller → pure domain functions + IndexedDB adapter`.
Core never imports browser globals or Svelte.

## 4. Business definitions

### 4.1 Habit directions
- `BUILD`: success when recorded measured progress meets goal.
- `QUIT`: user explicitly attests the day as `CLEAN` (success) or logs `LAPSE` (failure). Absence of check-in is not evidence of success. No assumption that a lapse can be counted from `0` automatic events.

### 4.2 Measurements (release sequence)
- BOOLEAN: complete/not complete; M1.
- COUNT: nonnegative integers toward threshold; M2.
- QUANTITY: finite nonnegative decimal in explicit unit; M2.
- DURATION: manually entered whole minutes; M2, no timer integration.
- QUIT ATTESTATION: clean/lapse; M2.

Avoid compound goals (e.g., 30 minutes AND 3 days) initially.

### 4.3 Schedule policy
- DAILY: every local calendar day from activation.
- WEEKDAYS: user selects arbitrary weekday set, not necessarily Monday–Friday.
- INTERVAL: every N local days anchored on `startDate` (e.g., every 2 days).
- WEEKLY_QUOTA: target `N DISTINCT DAYS / WEEK` with Monday-Sunday week, anchored in configured tracking timezone. Multiple check-ins on one date count as only one qualified day. This is explicitly distinct from fixed weekdays. Group week outcome is MET at N distinct successful days; otherwise pending until week closes, then MISSED. Daily date list for flexible quota treats eligible dates as opportunities, not mandatory missed dates.
- MONTHLY_QUOTA / MONTHLY_DATES: deferred; not M1 requirement.

For UI, show the semantics next to schedule picker. Do not expose a confusing generic `repeat: weekly` enum that conflates weekday and quota.

### 4.4 Period & timezone
- Calendar date is ISO `YYYY-MM-DD` in configured tracking timezone.
- Store `recordedAt` as UTC timestamp separately from `localDate`.
- One app-level `trackingTimezone` (IANA id) initialized from browser and persisted locally; changes apply prospectively under explicit policy to prevent silent history relocation. App has no account/profile.
- End of day/week is calculated from calendar boundaries in timezone, not adding fixed 86,400,000 milliseconds.
- Future periods never count as missed. Current period can be PENDING until its close.

### 4.5 States
Habit lifecycle: `ACTIVE → ARCHIVED`, `ARCHIVED → ACTIVE`, and permanent `DELETE` after confirmation.
Derived per-date/per-period outcomes: `NOT_SCHEDULED`, `PENDING`, `PARTIAL`, `MET`, `MISSED`, `SKIPPED`, optionally `UNKNOWN` for legacy/corrupt unavailable evidence. SKIPPED is an explicit user exception; recommendation: exclude it from completion-rate denominator but do not award success/streak, and do not break streak. Policy must be visible and tested. Skip is not a premium freeze token.

### 4.6 History edits & policy changes
- Rename/appearance can apply immediately without changing outcomes.
- Goal/schedule revisions take effect from an explicit chosen local date, default tomorrow. Old periods are evaluated using the policy effective at that time.
- Clear history for a day requires explicit command, never implicitly caused by editing target or archiving.
- Archive removes future obligations; does not erase prior records.
- Delete is irreversible; removes definition, policy revisions and check-ins in one transaction.

## 5. Key user journeys

J1 Create: Today → Add habit → Choose BUILD/QUIT → Name → Measurement and target → Schedule → Save → Current applicable date appears.
J2 Boolean: Today → tap → save transaction → read persisted result → row marked MET → today summary updates; repeat tap unchecks and recalculates.
J3 Quantity: Today → +250 ml → stored 250 → +250 ml → stored 500 → goal threshold checked → adjust -100 → stored 400 → outcome returns PARTIAL.
J4 Quit: Today → Clean day or Lapse → save → report outcomes; no mark is pending, not implicit clean.
J5 Correct: History → select older date → edit entry → save → redraw streak and month summary.
J6 Reschedule: Edit habit → choose new schedule → effective date → confirm → policies versioned; historic report stays stable.
J7 Archive: Habit detail → Archive → hidden from current obligations; historical entries retained; restore is supported.
J8 Delete: detail → destructive confirm → transactionally remove all related records; show success only once committed.
J9 Review: Insights → date/period and habit filters → compute planned, met, missed, skipped, rate, current/longest streak and calendar.
J10 Reload/multi-tab: Reopen browser → database loads; on another tab's write, refresh view; no silent stale overwrite.

## 6. Data design (proposal)

Object stores in feature-owned IndexedDB database, e.g. `modu-habit-tracker` v1:

`habits`:
```
{id, title, direction, icon?, color?, status, sortOrder, createdAt, updatedAt, archivedAt?}
```
Indexes `status`, `sortOrder`. `direction` = BUILD/QUIT.

`policies` (immutable revisions):
```
{id, habitId, effectiveFromDate, measurement, target, unit?,
 schedule:{type, weekdays?, intervalDays?, anchorDate?, daysPerWeek?}, createdAt}
```
Index `(habitId, effectiveFromDate)`. Require unique effective start per habit or explicit replace transaction. Disallow conflicting effective ranges by deriving end from next revision.

`checkins` (one date-scoped aggregate per habit):
```
{id:`${habitId}:${localDate}`, habitId, localDate,
 value?, attestation?:'CLEAN'|'LAPSE', skipped?:boolean,
 note?, recordedAt, updatedAt}
```
Unique key `(habitId, localDate)`; index `(habitId, localDate)` and date. For multiple manual increments, perform transaction: read row → validate → compute new value → put. A single daily aggregate is sufficient for this local/manual scope; an append-only event ledger is unnecessary. A future integration or detailed undo history could justify a revision then, not now.

`preferences`:
```
{id:'tracker', trackingTimezone, weekStart:'MONDAY', lastSeenSchemaVersion?}
```
Preferences are technical configuration; not a separate product profile domain.

`Insights` are derived views, not canonical durable data. Cache only when a measured performance need arises; invalidate on write, policy revision, archive/unarchive, or a new day.

### 6.1 Why IndexedDB rather than JSON localStorage
- Multiple records and per-habit/date queries.
- Atomic read-modify-write transaction for counter increments (protects against lost writes across tabs in same origin).
- Potentially years of small per-date records.
- Existing repo already demonstrates IndexedDB in Daily Evidence, but private module code should not be directly imported.
- Browser data can still be deleted or evicted; this is local storage, NOT a backup or cloud persistence guarantee.

Reference MDN: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Basic_Terminology

## 7. Critical engineering flows

### E1 CreateHabit
`CreateHabit(input) → validate title/direction/measurement/target/schedule → open readwrite IDB transaction(habits,policies) → put habit + initial policy → commit → controller refresh → Today`.
Failure: validation error (no write), storage unavailable (no write), quota error (no false success).

### E2 RecordCheckin
`RecordCheckin(habitId,date,operation) → resolve active habit + effective policy → validate date/action → IDB readwrite(checkins) → read existing checkin → apply operation → put or delete → commit → invalidate local projections → refresh Today/Insights`.
A user double click can be two intentional increments; do not treat all duplicates as retries. Buttons should debounce pending same-intent writes in the UI; operations serialize at storage level. No UUID/idempotency framework without a real automated caller.

### E3 EvaluateDay/EvaluateWeek
`load habit + effective policies + checkins → generate eligible periods → evaluate measured values → decide PENDING/PARTIAL/MET/MISSED/SKIPPED → derive summary/streak`.
One pure set of selectors feeds all views. Weekly quota's success unit is the WEEK, unlike fixed weekday daily completion.

### E4 UpdatePolicy
`validate revisions → determine effectiveFromDate → transaction put revision → refresh affected future projections`.
Never rewrite historic check-ins or existing immutable old policies to fabricate past accomplishments.

### E5 Archive/Delete
Archive: status update, history preserved. Delete: single IDB transaction deletes policy revisions and checkins plus habit. Recoverable deletion/backup beyond scope.

### E6 Concurrent tabs and local date rollover
- Each tab has per-mount controller; no SSR singleton.
- Use IDB transactions for mutations; BroadcastChannel/storage version signal only for view refresh, not state authority.
- Re-evaluate Today when returning to foreground, when local date changes, after every relevant write; no assumption that a background timer fires at midnight.

## 8. Core functions/contracts

Pure deterministic functions (illustrative signatures, no implementation):
```
validateHabitInput(input): ValidationResult
isDueOnDate(policy, localDate): boolean
resolvePolicy(habitId, localDate, revisions): HabitPolicy
applyCheckinOperation(current, policy, operation): Checkin | null
evaluateDailyOutcome(habit, policy, checkin, localDate, nowDate): DayOutcome
evaluateWeeklyQuota(habit, policy, checkins, weekRange, nowDate): WeekOutcome
calculateStreak(outcomes, periodKind): {current:number; longest:number}
calculateCompletionRate(outcomes): {met:number; eligible:number; rate:number|null}
buildTodaySummary(habits, policies, checkins, localDate): TodaySummary
```

Key adapter contracts:
```
createHabit(input): Promise<Habit>
updateHabitMetadata(habitId, input): Promise<void>
addPolicyRevision(habitId, effectiveDate, policy): Promise<void>
mutateCheckin(habitId, localDate, mutation): Promise<Checkin|null>
listHabits(): Promise<Habit[]>
listPolicies(habitIds, dateRange): Promise<HabitPolicy[]>
listCheckins(habitIds, dateRange): Promise<Checkin[]>
archiveHabit(habitId): Promise<void>
deleteHabit(habitId): Promise<void>
```

## 9. Required invariants

I01 No account, server source of truth, or cross-feature data read in core tracker.
I02 Every check-in refers to an existing habit and a valid date.
I03 One check-in aggregate per `(habitId, localDate)`.
I04 Progress values finite, nonnegative, and unit-compatible.
I05 A completed outcome is derived from applicable policy and actual recorded fact; not manually cached as independent truth.
I06 Unscheduled dates do not become failed dates.
I07 Current/future periods do not become prematurely MISSED.
I08 Multiple events on the same date count once toward a `daysPerWeek` quota.
I09 No implicit successful abstinence for QUIT habits.
I10 Historical policy revisions are immutable and effective-date-specific.
I11 Transaction failure cannot show success nor drop the previous committed state.
I12 Archive does not destroy history; delete explicitly does.
I13 All streak/report surfaces use the same evaluator.
I14 Existing Daily/Pomodoro storage and session history are untouched.

## 10. Fault model

- IndexedDB blocked/unavailable/version upgrade blocked → explanatory error + retry, no empty writable fallback that overwrites saved data.
- Quota exceeded → transaction abort + safe UI feedback.
- Corrupt entry/policy → contain error; no automatic global reset.
- Two tabs increment same progress → serialize in IDB transaction, do not perform stale in-memory overwrite.
- Clock/timezone changes → calendar helpers use explicit local dates and timezone; test DST boundaries.
- Date passes while app suspended → recompute on visibility/focus.
- Wrong goal revision → historic report uses correct effective policy.
- User clears browser data → data loss possible; do not imply cloud restore or device sync exists.

## 11. Architectural folder layout

```
src/routes/habit/+page.svelte
src/lib/platform/registry/modules.ts               # new tool metadata
src/lib/modules/habit-tracker/
  HabitTrackerWorkspace.svelte
  core/
    types.ts
    validation.ts
    scheduling.ts
    evaluation.ts
    streak.ts
    analytics.ts
  adapters/
    persistence.ts
  controller/
    habit-tracker.svelte.ts
  components/
    TodayView.svelte
    HistoryView.svelte
    InsightsView.svelte
    HabitEditor.svelte
    HabitRow.svelte
    HabitDetail.svelte
    DateStrip.svelte
```

Not every file should be created speculatively; start only with files required by each implementation milestone. Do not add `service/`, `repository/`, global store, generic plugin system, API routes or server database. Reuse shadcn-svelte primitive controls and styling tokens. This proposal respects `.agents/architecture.md`, `AGENTS.md` and `DESIGN.md`.

## 12. UX acceptance cases

UX01 Fresh user sees a single obvious Create habit action; no login and no config wizard.
UX02 Create flow does not ask for irrelevant data; relevant input changes by measurement.
UX03 Today states, count, and progress respond after successful persisted write.
UX04 Boolean and quantity check-in can be undone or corrected without deleting the habit.
UX05 History distinguishes scheduled MET, MISSED, SKIPPED and NOT_SCHEDULED with text/icons not only color.
UX06 Date changes do not flash incorrect stale data.
UX07 Error states preserve prior data and show retry/repair guidance.
UX08 All controls keyboard accessible; focus order logical; mobile touch targets safe.
UX09 QUIT never silently marks absence as achievement.
UX10 All screens stay on established module layout axis and semantic typography.

## 13. Engineering acceptance tests

T01 Daily boolean: checked today = MET; unchecked current today = PENDING; unchecked yesterday = MISSED.
T02 Fixed weekdays M/W/F: Tuesday is NOT_SCHEDULED; it does not break streak.
T03 Every N local days anchored Oct 1, interval 2: Oct1, Oct3, Oct5 due; Oct2 not due.
T04 Weekly 3 DISTINCT DAYS: multiple counters/check-ins Monday count as one eligible day.
T05 Weekly quota when Tuesday has 2 distinct successful days of required 3: still PENDING, not MISSED.
T06 Quantity +250+250 against target 500 = MET; decrease by 100 = PARTIAL.
T07 Duration manually 45 against goal 60 => PARTIAL, no Pomodoro dependency.
T08 QUIT without attestation = PENDING/MISSED based on policy, never MET; CLEAN = MET, LAPSE = MISSED.
T09 Edit goal effective tomorrow: yesterday's report remains unchanged.
T10 Change schedule: non-scheduled historical days remain stable.
T11 Undo historical check-in: streaks and calendar update coherently.
T12 Archive: hide from upcoming Today, retain prior Insights.
T13 Delete: definition + checkins + policy revisions removed transactionally.
T14 Two tabs increment together: no lost update from stale state.
T15 Storage abort/quota: UI reports failure, does not show success.
T16 Midnight/background resume: UI re-evaluates date on visibility.
T17 DST transitions: schedule eligibility calculated by calendar day, not fixed ms duration.
T18 Null denominator: completion-rate displays `—` instead of NaN/0%.
T19 App never accesses Daily/Pomodoro private records.
T20 Existing tests and build continue passing after module is registered.

## 14. Milestones and implementation dependency

M0: lock goal / schedule / outcome semantics; write pure scheduling and evaluation tests.
M1: register module + Today + habit CRUD and local persistence with daily boolean goals.
M2: count, quantity, duration, quit attestation, correction and history.
M3: specific weekday, interval, weekly quota, effective policy revision.
M4: History calendar and Insight statistics/streak using pure evaluators.
M5: cross-tab/data errors, timezone rollover and accessibility/regression hardening; release.

Per milestone verify relevant unit cases plus `bun run check`, `bun run test`, `bun run build` where feasible. Existing repo may have unrelated failures; report them separately. Nothing is implemented by this research document.

## 15. Decisions and open questions

D01 (recommended): one module/one bounded context with four internal capabilities; no extra domain microservices.
D02 (recommended): IndexedDB as authoritative local store for Habit Tracker, no new backend and no reuse of Daily `localStorage` key.
D03 (recommended): one date-aggregate checkin per habit/date; no append-only event sourcing in this scope.
D04 (recommended): immutable/effective-dated goal and schedule revisions.
D05 (recommended): explicit QUIT attestation; do not infer success from silence.
D06 (recommended): no cross-feature integration with Daily or Pomodoro in initial release.
D07 (recommended): period-based streak and scheduling semantics, consistent across UI.

Before coding, product owner should lock only these material choices:
- Do we include `WEEKLY_QUOTA` in initial release or first post-MVP milestone? Recommended: yes by M3.
- Should SKIPPED be user-visible? Recommended: yes; neutral, does not increase or break streak.
- Should old check-ins be user-editable indefinitely? Recommended: yes, with recalculation.
- Are policy changes effective from next day (default) or immediately? Recommended next day with explicit override date.

No other preliminary permissions, account setup, billing, provider connectors or integration decisions are required.