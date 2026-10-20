// @ts-ignore The repo lacks Cloudflare Durable Object type declarations; Wrangler validates this runtime import.
import { DurableObject } from "cloudflare:workers";
import { SyncSpaceHandler } from "./sync-space.ts";
import type { SyncStorage } from "./journal.ts";

/**
 * Production Durable Object runtime. Every instance owns one persistent
 * SQLite database. The public Worker has no enrollment/admin endpoints.
 */
export class SyncSpace extends DurableObject {
  private readonly handler: SyncSpaceHandler;

  constructor(ctx: { storage: SyncStorage }, env: unknown) {
    super(ctx, env);
    this.handler = new SyncSpaceHandler({ storage: ctx.storage as unknown as SyncStorage });
  }

  fetch(request: Request): Promise<Response> {
    return this.handler.fetch(request);
  }
}

export default {
  fetch(): Response {
    return new Response("Not found", {
      status: 404, headers: { "cache-control": "no-store" }
    });
  }
};
