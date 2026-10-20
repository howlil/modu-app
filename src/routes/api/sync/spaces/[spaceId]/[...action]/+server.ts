import type { RequestHandler } from "./$types";
import { forwardSyncControl } from "#lib/server/sync-gateway.ts";
const isAnon = (action: string, method: string) =>
  method === "POST" && (
    action === "recover" || /^pairings\/[0-9a-f-]{36}\/(join|status)$/.test(action)
  );
const isAllowed = (action: string, method: string): boolean =>
  (action === "pairings" && method === "POST") ||
  (/^pairings\/[0-9a-f-]{36}$/.test(action) && method === "GET") ||
  (/^pairings\/[0-9a-f-]{36}\/approve$/.test(action) && method === "POST") ||
  (action === "devices" && method === "GET") ||
  (/^devices\/[a-zA-Z0-9_-]{8,128}$/.test(action) && method === "DELETE") ||
  isAnon(action, method);
const handle: RequestHandler = ({ request, params, url }) => {
  const action = params.action ?? "";
  if (!isAllowed(action, request.method)) {
    return new Response(JSON.stringify({ error: "Not found." }), {
      status: 404, headers: { "content-type": "application/json", "cache-control": "no-store" }
    });
  }
  return forwardSyncControl(request, url, params.spaceId ?? "", {
    anonymous: isAnon(action, request.method), allowedMethods: [request.method]
  });
};
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
