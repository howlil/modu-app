import { env } from "cloudflare:workers";
import { json } from "@sveltejs/kit";
import { readLimitedSyncBody } from "#lib/platform/data/sync-body.ts";
import { SyncProtocolError } from "#lib/platform/data/sync-protocol.ts";
import type { RateLimiter } from "./feature-request-security.ts";

type Stub = { fetch(request: Request): Promise<Response> };
type SyncNamespace = { idFromName(name: string): unknown; get(id: unknown): Stub };
type SyncEnv = { SYNC_SPACE?: SyncNamespace; SYNC_PAIRING_IP_LIMITER?: RateLimiter };
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const SIGNED = ["x-modu-device", "x-modu-nonce", "x-modu-timestamp", "x-modu-signature"];

async function enforceAnonymousRateLimit(request: Request): Promise<Response | null> {
  const limiter = (env as unknown as SyncEnv).SYNC_PAIRING_IP_LIMITER;
  if (!limiter) return json({ error: "Pairing protection is not configured." }, { status: 503 });
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  try {
    const result = await limiter.limit({ key: "modu:pairing:" + ip });
    return result.success ? null : json({ error: "Too many pairing attempts." }, { status: 429 });
  } catch { return json({ error: "Pairing protection unavailable." }, { status: 503 }); }
}

/** Only the SvelteKit Worker can call the private SyncSpace DO binding. */
export async function forwardSyncControl(
  request: Request, url: URL, spaceId: string,
  options: { anonymous: boolean; allowedMethods: readonly string[] }
): Promise<Response> {
  if (!UUID.test(spaceId)) return json({ error: "Invalid sync space." }, { status: 400 });
  if (!options.allowedMethods.includes(request.method)) {
    return json({ error: "Method not allowed." }, { status: 405 });
  }
  if (request.method !== "GET" && request.headers.get("origin") !== url.origin) {
    return json({ error: "Invalid request origin." }, { status: 403 });
  }
  if (request.method === "POST" &&
      request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return json({ error: "Expected JSON." }, { status: 415 });
  }
  const runtime = env as unknown as SyncEnv;
  if (!runtime.SYNC_SPACE?.idFromName || !runtime.SYNC_SPACE.get) {
    return json({ error: "Cloud sync is not configured." }, { status: 503 });
  }
  if (options.anonymous) {
    const limited = await enforceAnonymousRateLimit(request);
    if (limited) return limited;
  } else if (SIGNED.some(name => !request.headers.has(name))) {
    return json({ error: "Signed device authorization required." }, { status: 401 });
  }
  let payload = "";
  if (request.method === "POST") {
    try { payload = await readLimitedSyncBody(request); }
    catch (cause) {
      return json({ error: cause instanceof SyncProtocolError ? cause.message : "Invalid request body." }, {
        status: cause instanceof SyncProtocolError ? cause.status : 400
      });
    }
  }
  const headers = new Headers();
  if (request.method === "POST") headers.set("content-type", "application/json");
  for (const key of SIGNED) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  // This URL is immutable after the client signs it; do not rewrite its path/query.
  const forwarded = new Request(request.url, {
    method: request.method, headers,
    body: request.method === "POST" ? payload : undefined
  });
  try {
    const result = await runtime.SYNC_SPACE.get(runtime.SYNC_SPACE.idFromName(spaceId)).fetch(forwarded);
    return new Response(result.body, { status: result.status, headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store", "x-content-type-options": "nosniff"
    } });
  } catch {
    return json({ error: "Sync service unavailable." }, { status: 503 });
  }
}
