export { SyncSpace } from "./sync-space.ts";

/** No public routes. All access goes through the modu-app Worker DO binding. */
export default {
  fetch(): Response {
    return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  }
};
