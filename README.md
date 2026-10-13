# Module

Local-first browser utilities built with SvelteKit, Tailwind CSS, shadcn-svelte, and Bun.

## Current scope

- Merge PDF
- Pomodoro
- Daily Execution (linked to Pomodoro focus sessions)
- Typing Practice

New modules require an end-to-end user workflow and must reuse existing capabilities rather than duplicate them.

## Architecture

```text
src/routes/                   route composition and API entry points
src/lib/components/ui/        shared shadcn-svelte primitives
src/lib/modules/pomodoro/     timer rules, activity, preferences, feature views
src/lib/modules/daily-execution/ planning, priorities, outcomes, reviews
src/lib/shared/focus-sessions/ shared session repository and task handoff
src/lib/modules/typing/       adaptive learner, typing session, persistence, feature views
src/lib/platform/registry/    tool metadata and availability
extension/                    independent Chromium permission/enforcement boundary
test/unit/                    deterministic behavior and storage regression tests
```

Keep routes as composition points, feature-specific UI in its owning module,
pure logic separate from browser APIs, and localStorage keys backward compatible.
Do not create a generic feature plugin or state framework until a real requirement needs it.

## UI system

Generic UI primitives come from **shadcn-svelte** and live under:

```text
src/lib/components/ui/
├── button/
├── card/
├── input/
├── dialog/
├── tabs/
└── ...
```

Add another official component with:

```bash
bun x shadcn-svelte@latest add [component]
```

Application pages should import from `$lib/components/ui/*`, not from `bits-ui` directly when shadcn-svelte provides the component.

The Module palette is mapped to shadcn semantic tokens in `src/app.css`.

## Local development

```bash
bun install
bun run dev
```

Verify:

```bash
bun run check
bun run test
bun run build
```

The committed `bun.lock` is the dependency source of truth; CI uses `bun install --frozen-lockfile`.

## Cloudflare Workers

This repository intentionally uses **Cloudflare Workers Builds**, matching the deployment model used by `howlil-app`.

Dashboard configuration:

```text
Build command: bun run build
Deploy command: npx wrangler deploy
Root directory: /
Production branch: master
```

Deployment contract:

```text
bun run build
  ↓
@sveltejs/adapter-cloudflare
  ↓
.svelte-kit/cloudflare/_worker.js
.svelte-kit/cloudflare/*
  ↓
npx wrangler deploy
  ↓
wrangler.jsonc
  ↓
Cloudflare Worker + Static Assets
```

The committed `wrangler.jsonc` is required. It prevents Wrangler from trying to auto-configure SvelteKit during deploy.

Do not run `sv add cloudflare` in CI and do not change the build script to `wrangler types --check && vite build`.

## Source of truth

1. `AGENTS.md`
2. `DESIGN.md`
3. existing code/tests


## Feature request API protection

The public POST /api/feature-request endpoint creates GitHub issues. It has:

- exact same-origin check (including rejecting a missing Origin);
- Cloudflare Workers Rate Limiting bindings: up to 5 requests/minute per IP and up to 20 requests/minute with a shared key **per Cloudflare location**;
- JSON and payload validation, body size cap, and an inert honeypot.

These limits are configured in wrangler.jsonc. Workers Rate Limiting is eventually consistent, so brief bursts may exceed the configured values. The per-IP key can also group users sharing an IP address. Neither limiting nor Origin checking is authentication or complete protection against scripted abuse.

Configure GITHUB_TOKEN as an encrypted Cloudflare Worker secret: a fine-grained GitHub PAT with **Issues: Read and write** permission on **howlil/modu-app only**. Never put the token in repository files, browser code, or public variables.

If either rate limiting binding is unavailable, the endpoint returns 503 without creating a GitHub issue. When a limit is exceeded, it returns 429. The UI offers a link to create the issue directly on GitHub if submission fails. Locally, set GITHUB_TOKEN in an untracked .dev.vars file.

After deployment, check that requests with missing/foreign Origin return 403; invalid JSON returns 400 (within the rate limits); and excess requests return 429. A test using a valid payload creates a real GitHub issue, so avoid it unless intentional.


## Daily M3: Google Tasks (opt-in, read-only)

Daily works without an account. Public GitHub Issues, manual HTTPS links, JSON imports,
Today, and Pomodoro do **not** depend on Google OAuth.

Google Tasks is implemented behind a **fail-closed server configuration gate**.
Until all bindings and secrets are present, `/api/daily/google/status` returns
`{"available":false,"connected":false}`; no provider token is stored or exposed
to client JavaScript.

**Infrastructure setup — requires access to the Cloudflare and Google consoles:**

1. Create an OAuth consent screen and an **OAuth Web Application** in Google Cloud;
   enable the Google Tasks API. Set its exact authorized redirect URI to
   `https://modu.howlil.site/api/daily/google/callback`. Use test users while the
   OAuth application is in testing, and request only the `tasks.readonly` scope.
2. Create a Cloudflare D1 database with the `DAILY_AUTH_DB` binding:

   ```bash
   npx wrangler d1 create modu-daily-auth --binding DAILY_AUTH_DB --update-config
   npx wrangler d1 migrations apply modu-daily-auth --remote
   ```

   Commit the real generated D1 `database_id` to `wrangler.jsonc`.
   Do not invent a database ID, and do not apply the migration to another database.
3. Configure encrypted Worker secrets with `npx wrangler secret put`:

   ```text
   GOOGLE_OAUTH_CLIENT_ID
   GOOGLE_OAUTH_CLIENT_SECRET
   GOOGLE_OAUTH_REDIRECT_URI
   GOOGLE_TOKEN_ENCRYPTION_KEY
   ```

   The redirect URI value must match step 1 exactly. Generate the 32-byte
   encryption key **locally** with:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

   Keep all secret values out of git, screenshots and chat.
4. Deploy using the existing Cloudflare Workers Builds configuration or
   `npx wrangler deploy`. Check the same-origin `/api/daily/google/status`
   endpoint: it should report `available: true` when configured, while fresh
   browsers remain `connected: false`.
5. Open **Daily → All → Activity sources → Connect Google Tasks**. Grant the
   read-only permission, return to Daily, refresh, select an activity, then
   disconnect and confirm that the Modu task/history remains.
6. Run the manual GitHub Actions workflow **Daily Production Smoke**, which
   performs the isolated browser journeys against `https://modu.howlil.site/daily`.
   This workflow is *not* proof of a successful OAuth consent until the real
   end-to-end sign-in is separately verified.

**Security and data ownership:** the Google refresh token is encrypted with
AES-GCM in Cloudflare D1; its encryption key, client secret and access tokens never
go to the browser. A randomly generated, hashed session ID is linked to a
`HttpOnly`, `SameSite=Lax`, production-`Secure` browser cookie, scoped to
`/api/daily/google`. PKCE + a one-time, 10-minute CSRF state protect authorization.
Server endpoints enforce same-origin POSTs; the Worker redacts request query
strings. The application stores only *read-only activity snapshots* locally.
Completing a Modu task never changes Google Tasks.

This is intentionally **browser-scoped access, not a multi-device Modu user
account**. Reconnecting with another Google account creates a new connection ID;
previously linked tasks remain detached from the live account but retain their local
history. Revocation is requested from Google on disconnect; if Google is unreachable,
the local server-side credential is deleted nonetheless. Expired sessions and OAuth
flows are purged opportunistically when new connections start, not by a periodic
scheduler.

**Usability release check (manual, not implied by automated tests):** observe
people capturing an activity, connecting a source, choosing Next, focusing,
completing locally, checking the original, disconnecting, and recovering offline.
Record success, help needed, misclicks, and unresolved P0/P1 issues. A passing
automated browser suite does not count as a user study.
