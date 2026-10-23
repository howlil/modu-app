# Career Evidence — M7 Release Acceptance

Status: **release blocked pending executable verification** (2026-10-24).
Target: feature route \`/brag-document\` on \`master\`; no tag or production deployment is implied by this document.

## Verified by repository source inspection

- The Career Evidence module is registered as the fourth tool; landing navigation order is Language Learning, Habit Tracker, Career Evidence, Pomodoro.
- Feature-owned domain and controller are separated from IndexedDB and platform transport adapters.
- \`moments\`, \`outputs\`, \`snapshots\` and sync metadata/outbox/inbox are implemented in additive IndexedDB version 4.
- Draft and source writes use optimistic revision checks; finalized snapshots are append-only.
- Global backup/restore and sync use the existing Modu data ports; foreign replay validates entity references and revisions.
- Legacy three-module global backups are supported only through an explicit empty Career Evidence migration, with a clear-data warning.
- Chrome acceptance is configured for Capture → History edit → archive/restore → document creation → evidence selection → narrative → finalize → print invocation → reload → mobile 390px.
- Old landing and global-data Chrome assertions have been updated to four modules.

**The above are source-level observations, not evidence of successful test execution.**

## Release gates — all required

| Gate | Command / test | Acceptance | Current verification |
| --- | --- | --- | --- |
| TypeScript/Svelte | \`bun run check\` | Zero errors | Not run in this environment |
| Unit + IndexedDB integration | \`bun run test\` | All tests green | Not run in this environment |
| Cloudflare bundle | \`bun run build\` | Success | Not run in this environment |
| Worker deployability | \`bunx wrangler deploy --config wrangler.sync.jsonc --dry-run --outdir .wrangler/dry-run-modu-sync\` | Success | Not run in this environment |
| Signed transport integration | \`node test/integration/sync-worker-runtime.mjs\` | Success | Not run in this environment |
| Existing Habit regression | \`node test/e2e/habit-tracker-browser.mjs\` | Success | Not run in this environment |
| Global Data & Sync regression | \`node test/e2e/global-data-browser.mjs\` | Success, four modules and IDB v4 | Not run in this environment |
| Career Evidence full flow | \`node test/e2e/career-evidence-browser.mjs\` | Success | Not run in this environment |
| Desktop + mobile manual | Chrome 1440px / 860px / 390px / 360px | No overflow, focus traps, lost edits | Not run |
| Printed PDF manual | A4, >1 page, long narrative/evidence URL | Visible content, correct page breaks | Not run |
| Sync conflict + recovery | Two devices, stale revisions, restore fault injection | No silent overwrite, recoverable | Tests written, execution pending |

The \`Verify\` workflow runs all automated steps after dependency install and Chrome setup. The connected GitHub tool only returns pull-request-triggered workflow runs; absence of results for a push is **not** a passing or failing CI result. Check workflow status directly at \`/actions/workflows/verify.yml\`.

## Manual acceptance scenarios

1. Capture one sentence with no project or metrics; reload and verify it persists.
2. Add context, contribution, outcome and two evidence links; navigate away with unsaved changes; choose cancel and discard separately.
3. Open the same record from two browser tabs; save one, confirm stale editor in the other cannot overwrite it.
4. Archive, restore, search by evidence URL, filter year/month including empty states.
5. Build Backend and Cloud outputs from one source, edit one narrative and confirm the other is unchanged.
6. Finalize a document, edit its source and confirm the older version still prints unchanged.
7. Global backup → change data → restore → verify moments, outputs, snapshots, references and revisions.
8. Corrupt or remove a referenced moment in a backup; confirm restore preview rejects it without writing.
9. Pair two browser profiles, push/pull sources/drafts/snapshots, then inject a stale conflicting revision; verify cursor and data rollback.
10. Test keyboard navigation, screen reader status/error announcements and 360px/390px mobile layouts.
11. Print a multi-page A4 version in Chrome, manually inspect the resulting PDF for text, links and clipping.
12. Verify local-only use when cloud sync feature flag is off; sync is not represented as active until pairing.

## Release policy

**NO-GO** while any automated gate is unknown or red, any privacy/data integrity defect is unresolved, or the print/browser acceptance is unverified.
Do not mark the feature production-ready, tag a release or deploy solely based on committed code.
Once gates pass, repeat the independent code/design review and record exact commit SHA and green workflow URL.
