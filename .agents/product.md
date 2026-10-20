# Product — modu-app (Data & Sync experience proposal)

Status: **proposed redesign, research only** (2026-10-21). No UI or synchronization behavior is changed by this document. Existing backup/restore and feature-owned persistence contracts remain authoritative until implementation and acceptance.

## Problem

**Actor:** one person using modu-app on a laptop and a phone, without an app account.

**Trigger:** their Pomodoro, Habit Tracker and Language Learning activity should follow them between browsers/devices.

**Observed behavior (current repository):** `DevicePairingSettings.svelte` exposes Create sync space → Complete local setup → Sync now → Pair another device → copy 3-part invitation → join on secondary device → manually check request and approval → type 6-digit confirmation → verify approval → manually sync each device. Device label, remote space ID, recovery and cursor metadata appear in ordinary UI.

**Problem:** backend protocol states are exposed as user tasks. The person has to understand and repeat technical steps unrelated to getting their data on the other device. Returning after reload can require re-pasting the pairing invitation. There is no automatic foreground sync: `syncNow` runs only from the explicit button.

**Evidence:** direct repository inspection and user-reported testing pain. Exact abandonment rates and completion times are not known and should be measured in usability testing, not assumed.

## Job and outcome

**Job:** “Make my local Modu data available on the other device, and keep it in sync while I use the app, without having to understand sync machinery.”

**Outcome:** one-time explicit consent to enable cloud sync, two-device authorization via QR/link and existing-device approval, automatic initial transfer and foreground incremental synchronization, with honest visible success/error states and no silent data overwrite.

## Changed product behavior graph

```text
Local-only Data & Sync
  → [user: Turn on sync, explicitly consent to remote storage]
  → [system: create device identity + space, capture and upload local baseline]
  → Connected on this device, recoverable credentials offered

Connected device
  → [user: Connect another device]
  → [system: show QR and shareable pairing link]
  → [new device: scans QR / opens link]
  → [system: prepares candidate and shows matching verification code]
  → [old device: visually checks code and approves once]
  → [system: proves new device key possession, imports baseline safely]
  → Both devices Connected

Connected, app is open
  → [local change / comes online / app becomes visible]
  → [system: bounded, debounced, retryable sync with local-first outbox]
  → [UI: last successful sync + local pending count]
  → Up to date
```

No automatic upload before the initial explicit opt-in. Automatic foreground syncing is the desired replacement for repeated `Sync now` clicks; it does not promise syncing while the browser is closed.

## Meaningful break paths

- **First device's local data and new device's existing data differ:** never overwrite either silently. Show "Needs review", explain the domains involved, and allow backup/export plus an explicit preview-based resolution. Do not claim the devices are synced.
- **Pairing invitation expires or candidate is rejected:** show "Expired" / "Not approved" and a one-tap retry; don't force reconstruction of previous setup.
- **Pairing interrupted/reloaded:** the new device resumes a persisted *pending* request; do not store the invitation secret in analytics, query strings, debug logs or server-rendered markup.
- **Offline/browser closed:** local changes remain saved; show "Saved on this device · waiting to sync". Resume when the app returns online/visible.
- **Quota, conflict, server unavailable, revoked device:** report actionable reason without deleting local outbox or changing applied cursor.
- **Recovery key lost:** keep existing paired devices working. Recovery from a stored key revokes previous devices; disclose before proceeding.
- **Background sync unsupported:** no false "Always syncing" claim. Scoped promise is "Syncs automatically while Modu is open".

## Constraints

- No user account/login.
- Local-first; preserve browser IndexedDB ownership for each module.
- One consent boundary before cloud transfer. Payloads are server-readable today: explain clearly, without claiming E2EE.
- Approval from an existing device remains mandatory for QR/link join, with cryptographic binding to the candidate public key and comparable verification phrase/code.
- Keep device revocation, disaster recovery and manual backup in secondary settings.
- Preserve 256 KiB request limits and journal safety; if an initial dataset cannot be transferred, show a truthful blocked state and fallback to backup, not a false success.

## Minimum product scope

**In:** progressively disclosed Data & Sync status; single setup CTA; QR plus copy/share link; join directly from URL/QR; pending request automatically refreshed while screen is open; one existing-device approve step; automatic initial sync; foreground incremental sync with manual Retry; accurate per-module success, pending and conflict messages; advanced backup/recovery/device management.

**Out:** account login, P2P LAN discovery, guaranteed sync with all browsers closed, unreviewed automatic conflict overwrite, deleting the current cryptographic approval model, and unlimited-history support before chunked baseline engineering.

## Acceptance traces

1. **Fresh laptop:** Given local-only state, when user enables cloud sync and consents, then all available module data is durably uploaded and the page shows Connected with no additional "Complete setup" or "Sync now" action.
2. **New phone:** Given a connected laptop, when phone opens a QR pairing link, and the laptop approves the matching device, then phone becomes Connected and receives baseline data without manual code entry, separate verification clicks or manual Sync now.
3. **Later edit:** Given both browsers are paired and Modu is open/online, when a supported local record changes, then the other online browser receives it without an explicit Sync now click; pending changes survive network loss.
4. **Offline:** Given an offline browser, when user changes data, then the UI shows locally saved and pending sync. Upon reopening online, the queued changes are transmitted once with idempotent retries.
5. **Conflict:** Given divergent changes or incompatible existing data, when a merge cannot be validated, then the affected module pauses, preserves both local and remote data and offers backup/review.
6. **Reload during pairing:** Given a pending request, when the new device reloads the page, then the pending state resumes without the user pasting an invitation again.
7. **Security:** Given a scanned link, when an old device has not approved the candidate key, then the new browser cannot access the sync space, even though it knows the invitation URL.

## Assumptions requiring validation

- QR scanning via the phone's **native camera** is available and preferred; offer copy/share-link and manual-code fallback.
- Auto-foreground sync must not interfere with Pomodoro timer UX; measure perceived latency and completion during cross-device testing.
- Users prefer zero required device naming; propose automatically detected device label with optional rename.
- Measure onboarding completion, user actions to first synchronized data, time to first synchronized data, retry frequency, and percentage of unexplained status/error outcomes; no numeric goals are assumed yet.

## Interface handoff

Create a compact Data & Sync status section inside `/settings/data` (not a fourth landing-page module), with one primary action and hidden advanced options for devices, backup and recovery. Surface only meaningful states: Local only / Connecting / Waiting for approval / Syncing / Up to date / Pending offline / Needs review / Unavailable. UI layout, interaction tokens and device-specific scanner affordances belong to `$design-graph` before implementation.
