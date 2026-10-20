import { env } from "cloudflare:workers";
import { json, type RequestHandler } from "@sveltejs/kit";
import { SYNC_MAX_BODY_BYTES } from "#lib/platform/data/sync-protocol.ts";

type SyncStub = { fetch(request: Request): Promise<Response> };
type SyncNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): SyncStub;
};
type SyncEnv = { SYNC_SPACE?: SyncNamespace };

const SPACE_PATTERN =
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;

async function forward(
  request: Request, spaceId: string, origin: string
): Promise<Response> {
  if (!SPACE_PATTERN.test(spaceId)) {
    return json({ error: "Invalid sync space." }, { status: 400 });
  }
  if (request.method === "POST" &&
      request.headers.get("origin") !== null &&
      request.headers.get("origin") !== origin) {
    return json({ error: "Invalid request origin." }, { status: 403 });
  }
  const namespace = (env as unknown as SyncEnv).SYNC_SPACE;
  if (!namespace?.idFromName || !namespace.get) {
    return json({ error: "Sync is not configured." }, { status: 503 });
  }
  for (const header of ["x-modu-device", "x-modu-nonce", "x-modu-timestamp", "x-modu-signature"]) {
    if (!request.headers.get(header)) {
      return json({ error: "Signed device authorization required." }, { status: 401 });
    }
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(length) || length > SYNC_MAX_BODY_BYTES) {
    return json({ error: "Sync payload too large." }, { status: 413 });
  }
  const payload = request.method === "POST" ? await request.text() : "";
  if (new TextEncoder().encode(payload).byteLength > SYNC_MAX_BODY_BYTES) {
    return json({ error: "Sync payload too large." }, { status: 413 });
  }
  const allowedHeaders = new Headers();
  for (const key of [
    "x-modu-device", "x-modu-nonce", "x-modu-timestamp",
    "x-modu-signature", "content-type"
  ]) {
    const value = request.headers.get(key);
    if (value !== null) allowedHeaders.set(key, value);
  }
  const forwarded = new Request(request.url, {
    method: request.method, headers: allowedHeaders,
    body: request.method === "POST" ? payload : undefined
  });
  try {
    const stub = namespace.get(namespace.idFromName(spaceId));
    const result = await stub.fetch(forwarded);
    // Avoid forwarding Set-Cookie / cache / tracing headers from a future handler.
    return new Response(result.body, {
      status: result.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      }
    });
  } catch {
    return json({ error: "Sync storage is temporarily unavailable." }, { status: 503 });
  }
}

export const GET: RequestHandler = ({ request, params, url }) =>
  forward(request, params.spaceId ?? '', url.origin);

export const POST: RequestHandler = ({ request, params, url }) =>
  forward(request, params.spaceId ?? '', url.origin);
