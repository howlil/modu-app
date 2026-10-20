import { env } from "cloudflare:workers";
import { json, type RequestHandler } from "@sveltejs/kit";
import { readLimitedSyncBody } from "#lib/platform/data/sync-body.ts";
import { parseDeviceIdentity, randomSecret } from "../../../../sync-worker/pairing.ts";
import { SyncProtocolError } from "#lib/platform/data/sync-protocol.ts";
import type { RateLimiter } from "#lib/server/feature-request-security.ts";

type Namespace = { idFromName(space: string): unknown; get(id: unknown): { fetch(req: Request): Promise<Response> } };
type Runtime = { SYNC_SPACE?: Namespace; SYNC_PAIRING_IP_LIMITER?: RateLimiter };
export const POST: RequestHandler = async ({ request, url }) => {
  if (request.headers.get("origin") !== url.origin) {
    return json({ error: "Invalid request origin." }, { status: 403 });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return json({ error: "Expected JSON." }, { status: 415 });
  }
  const runtime = env as unknown as Runtime;
  if (!runtime.SYNC_SPACE?.idFromName || !runtime.SYNC_SPACE.get || !runtime.SYNC_PAIRING_IP_LIMITER) {
    return json({ error: "Device pairing is not configured." }, { status: 503 });
  }
  try {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const limit = await runtime.SYNC_PAIRING_IP_LIMITER.limit({ key: "modu:pairing:" + ip });
    if (!limit.success) return json({ error: "Too many pairing attempts." }, { status: 429 });
    const identity = parseDeviceIdentity(JSON.parse(await readLimitedSyncBody(request)));
    const spaceId = crypto.randomUUID();
    const recoveryKey = randomSecret();
    const internal = new Request(url.origin + "/api/sync/initialize/" + spaceId, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ identity: {
        deviceId: identity.deviceId, name: identity.name, publicKey: JSON.parse(identity.publicKey)
      }, recoveryKey })
    });
    const result = await runtime.SYNC_SPACE.get(runtime.SYNC_SPACE.idFromName(spaceId)).fetch(internal);
    if (!result.ok) return json({ error: "Could not initialize secure sync space." }, { status: 502 });
    return json({ spaceId, recoveryKey }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (cause) {
    if (cause instanceof SyncProtocolError) return json({ error: cause.message }, { status: cause.status });
    return json({ error: "Sync initialization failed." }, { status: 503 });
  }
};
