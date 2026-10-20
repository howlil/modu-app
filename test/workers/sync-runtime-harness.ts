/**
 * TEST WORKER ONLY: binds the real production SyncSpace Durable Object to
 * a private, disposable local workerd process. Never deploy this entrypoint.
 */
export { SyncSpace } from "../../src/sync-worker/index.ts";

type Namespace = { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } };
type TestEnv = { SYNC_SPACE: Namespace };
const CHANGE_PATH = /^\/api\/sync\/spaces\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\//;
const INIT_PATH = /^\/api\/sync\/initialize\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/;

export default {
  async fetch(request: Request, env: TestEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/__health" && request.method === "GET") {
      return new Response("ready", { status: 200 });
    }
    const spaceId = CHANGE_PATH.exec(url.pathname)?.[1] ??
      INIT_PATH.exec(url.pathname)?.[1];
    if (!spaceId) return new Response("Not found", { status: 404 });
    const stub = env.SYNC_SPACE.get(env.SYNC_SPACE.idFromName(spaceId));
    return await stub.fetch(request);
  }
};
