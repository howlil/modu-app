# Modu Focus Companion

Chromium Manifest V3 extension for Modu Pomodoro and Daily Execution. Two independent, opt-in features:

- **Floating focus widget** — an optional countdown and linked task in a Shadow DOM. Starts collapsed with a compact timer, expands to show the next action, and uses Modu's original logo, color tokens and Lucide-style icons. Injected only when enabled.
- **Focus Protection** — blocks user-selected distracting sites during Focus, including SPA navigations and already-open tabs. Blocking continues during Pause/Overtime and ends on Break/Reset/Skip.

The web app owns timer transitions and recorded session history; the extension never automatically creates completed sessions.

## Install and validate

1. Visit chrome://extensions, enable Developer mode, and Load unpacked using this extension/ folder.
2. After pulling extension changes, click Reload on chrome://extensions and refresh already-open website tabs. A Cloudflare web deployment does **not** update the unpacked Chrome extension.
3. Visit https://modu.howlil.site/pomodoro or the local development server.
4. Open Settings → Floating focus. Check that the extension is connected and enable the widget. Start a Focus session or launch one from Daily.
5. Switch to another HTTP(S) website and refresh that tab if needed. The widget is hidden on Modu itself, localhost, restricted Chrome pages, excluded domains, and while the timer is idle. Expand the timer to see the task and next action.
6. Pause and resume in the Pomodoro web app. The countdown must freeze and resume.
7. **Drag and drop:** grab the mini timer's logo/text area, or any non-button surface of the expanded panel, then move it anywhere inside the browser viewport with mouse, pen or touch. The position is saved across supported websites and browser restarts and clamped back into view on resize. The chevron, Hide and Open timer remain click-only controls.
8. **Minimize** (chevron) keeps the small timer visible. **Hide** (eye-off) removes it on the current tab for this session. To restore it during the same session, **pin Modu Focus Companion** in the Brave/Chrome toolbar and click its icon while viewing that website. It expands again. A new session automatically brings the floating timer back.
9. The toolbar restore does nothing when the timer is idle, floating is disabled, the tab is excluded, or the tab is an internal browser page.
10. Disable Floating focus; the overlay must disappear without changing Focus Protection.
11. Exclude a hostname and verify the widget stays hidden there. Test existing blocked-site navigation separately.

## Privacy and permissions

- storage: persists the user’s floating preferences, latest task/timer snapshot, widget position (two relative numbers), blocklist, and focus protection state in the browser.
- scripting + host_permissions: enables injection on ordinary websites only after the user opts into Floating focus. The existing host permissions also support user-defined blocklists.
- webNavigation + declarativeNetRequestWithHostAccess: supports website blocking.
- No visited URLs, page contents, page titles or browsing history are collected. Current hostname is examined locally for exclusions; no browsing data is recorded.
- Task title and next action can be visible on the website. Avoid confidential task names or disable Show active task / exclude sensitive websites.

## Architecture

Daily task → Pomodoro controller (single timer owner) → trusted Modu extension bridge → MV3 service worker → extension local storage → Shadow DOM floating widget.

The widget is read-only. The displayed clock is derived from absolute timestamps; after the deadline it says Time reached until the authoritative Pomodoro state is reconciled. Snapshots older than 24 hours are hidden.

Dynamically registered content scripts are unregistered when Floating is disabled; already-running scripts listen to settings and remove the overlay. Widget styles mirror Modu app.css tokens rather than adopting host-page styles. The toolbar action only requests a restore on the active eligible tab; it does not change timer state, save extra data, or enable floating globally.

## Verification

Run bun run check, bun run test, and bun run build from the repository root. Also perform Chromium browser smoke tests for permissions, injection, style isolation, and Focus Protection regression.
