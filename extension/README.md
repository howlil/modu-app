# Module Focus Protection

Chromium Manifest V3 companion extension for the Module Pomodoro timer.

## What it does

- Blocks every route under websites the user explicitly adds, including SPA route changes such as `x.com/home`.
- Immediately redirects already-open blocked tabs when Focus Protection starts.
- Activates during Focus sessions.
- Stays active while Focus is paused or in overtime.
- Releases blocking on Break, Reset, or Skip.
- Keeps enforcement running when the Module tab is backgrounded or closed.
- Stores only the blocklist and active focus-session metadata locally.

It does not collect visited URLs, page content, page titles, or browsing history.

## Local development

1. Open `chrome://extensions` in Chrome, Edge, or Brave.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `extension/` directory.
5. After pulling extension changes, press **Reload** on the extension card so manifest/service-worker changes take effect.
6. Open Module at `https://modu.howlil.site/pomodoro` or the local dev server.
7. Open Pomodoro settings. **Module extension** should show **Connected**.

The extension requests host access because user-defined blocklists can contain arbitrary websites.

## Architecture

```
Module Pomodoro
      |
window.postMessage
      |
content-bridge.js
      |
chrome.runtime messaging
      |
service-worker.js
      |
declarativeNetRequest session rules
      |
blocked/index.html
```

The web app controls intent. The extension owns enforcement.

## Recovery

Session rules are browser-session scoped. On browser startup the extension reads the saved active focus session and recreates rules when the session is still valid. Stale protection is automatically discarded after 24 hours as a safety limit.
