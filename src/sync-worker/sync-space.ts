import { SyncJournal, type SyncStorage } from "./journal.ts";
import { readLimitedSyncBody } from "../lib/platform/data/sync-body.ts";
import { readSignedHeaders, verifyDeviceSignature } from "./signature.ts";
import {
  SYNC_MAX_BODY_BYTES, parsePullQuery, parseSyncPush, SyncProtocolError
} from "../lib/platform/data/sync-protocol.ts";

export interface SyncSpaceState { storage: SyncStorage }

const response = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status, headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });

/**
 * All routing into this object is private through modu-app's DO binding.
 * A guessed space identifier is never sufficient to authenticate.
 * M4 intentionally exposes no enrollment or admin routes.
 */
export class SyncSpaceHandler {
  private readonly journal: SyncJournal;
  constructor(state: SyncSpaceState) {
    this.journal = new SyncJournal(state.storage);
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (!/^\/api\/sync\/spaces\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\/changes$/.test(url.pathname) ||
          !["GET", "POST"].includes(request.method)) {
        return response({ error: "Not found." }, 404);
      }
      const signed = readSignedHeaders(request);
      // Check device enrollment BEFORE reading any journal data.
      const publicKey = this.journal.getActiveDevice(signed.deviceId);
      if (!publicKey) throw new SyncProtocolError(401, "Device is not paired with this space.");
      if (request.method === "POST" &&
          request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
        throw new SyncProtocolError(415, "Sync push requires JSON.");
      }
      const len = request.headers.get("content-length");
      if (len && Number(len) > SYNC_MAX_BODY_BYTES) {
        throw new SyncProtocolError(413, "Sync request exceeds the size limit.");
      }
      const body = request.method === "POST" ? await readLimitedSyncBody(request) : "";
      await verifyDeviceSignature(request, body, publicKey, signed);
      if (request.method === "GET") {
        const { after, limit } = parsePullQuery(url);
        return response(this.journal.changes(signed.deviceId, signed.nonce, after, limit));
      }
      let parsed: unknown;
      try { parsed = JSON.parse(body); }
      catch { throw new SyncProtocolError(400, "Invalid sync JSON."); }
      const operations = parseSyncPush(parsed, signed.deviceId);
      return response(this.journal.accept(signed.deviceId, signed.nonce, operations));
    } catch (cause) {
      if (cause instanceof SyncProtocolError) return response({ error: cause.message }, cause.status);
      // Do not leak SQLite details or user data in server responses/logs.
      return response({ error: "Sync request failed." }, 500);
    }
  }
}
