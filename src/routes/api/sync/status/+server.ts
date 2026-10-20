import { env } from "cloudflare:workers";
import { json, type RequestHandler } from "@sveltejs/kit";

type Runtime = { SYNC_ROLLOUT_ENABLED?: string; SYNC_SPACE?: unknown; SYNC_PAIRING_IP_LIMITER?: unknown };
/** Publicly reports only the operator-controlled enabled/disabled state. */
export const GET: RequestHandler = () => {
  const config = env as unknown as Runtime;
  const enabled = config.SYNC_ROLLOUT_ENABLED === "true" &&
    !!config.SYNC_SPACE && !!config.SYNC_PAIRING_IP_LIMITER;
  return json({ enabled }, { headers: { "cache-control": "no-store" } });
};
