import { SyncJournal, type SyncStorage } from "./journal.ts";
import { PairingRegistry, parseDeviceIdentity, validateImportableDeviceKey, secretDigest } from "./pairing.ts";
import { readLimitedSyncBody } from "../lib/platform/data/sync-body.ts";
import { readSignedHeaders, verifyDeviceSignature } from "./signature.ts";
import {
  SYNC_MAX_BODY_BYTES, parsePullQuery, parseSyncPush, SyncProtocolError
} from "../lib/platform/data/sync-protocol.ts";

export interface SyncSpaceState { storage: SyncStorage }
const ROOT = /^\/api\/sync\/spaces\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(?:\/(.*))?$/;
const INITIALIZE = /^\/api\/sync\/initialize\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/;
const response = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store", "x-content-type-options": "nosniff"
  } });
function jsonObject(body: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(body); }
  catch { throw new SyncProtocolError(400, "Invalid sync JSON."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SyncProtocolError(400, "Sync request must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}
function invitationId(input: string): string {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(input)) {
    throw new SyncProtocolError(400, "Invalid pairing invitation.");
  }
  return input;
}
/** All endpoints here are private DO binding calls from the validated SvelteKit gateway. */
export class SyncSpaceHandler {
  private readonly journal: SyncJournal;
  private readonly pairing: PairingRegistry;
  constructor(state: SyncSpaceState) {
    this.journal = new SyncJournal(state.storage);
    this.pairing = new PairingRegistry(state.storage, this.journal);
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const initialization = INITIALIZE.exec(url.pathname);
      const match = ROOT.exec(url.pathname);
      if (!initialization && !match) return response({ error: "Not found." }, 404);
      if (request.method !== "GET" && request.method !== "POST" && request.method !== "DELETE") {
        return response({ error: "Method not allowed." }, 405);
      }
      const len = request.headers.get("content-length");
      if (len && Number(len) > SYNC_MAX_BODY_BYTES) {
        throw new SyncProtocolError(413, "Sync request exceeds the size limit.");
      }
      if (request.method === "POST" &&
          request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
        throw new SyncProtocolError(415, "Sync request requires JSON.");
      }
      const body = request.method === "POST" ? await readLimitedSyncBody(request) : "";
      if (initialization) {
        if (request.method !== "POST") return response({ error: "Not found." }, 404);
        const data = jsonObject(body);
        const identity = parseDeviceIdentity(data.identity);
        await validateImportableDeviceKey(identity);
        if (typeof data.recoveryKey !== "string") throw new SyncProtocolError(400, "Recovery key missing.");
        const hash = await secretDigest(data.recoveryKey);
        this.pairing.bootstrap(identity, hash);
        return response({ created: true, spaceId: initialization[1] }, 201);
      }
      const action = match![2] ?? "";
      // Unsigned operations are still protected by 256-bit single-use capabilities.
      // The public SvelteKit gateway rate-limits all these paths separately.
      if (request.method === "POST" && action === "recover") {
        const data = jsonObject(body);
        const identity = parseDeviceIdentity(data.identity);
        await validateImportableDeviceKey(identity);
        if (typeof data.recoveryKey !== "string") throw new SyncProtocolError(400, "Recovery key missing.");
        return response(await this.pairing.recover(identity, data.recoveryKey));
      }
      const join = /^pairings\/([0-9a-f-]{36})\/(join|status)$/.exec(action);
      if (request.method === "POST" && join) {
        const id = invitationId(join[1]);
        const data = jsonObject(body);
        if (typeof data.secret !== "string") throw new SyncProtocolError(400, "Invitation secret missing.");
        if (join[2] === "join") {
          const identity = parseDeviceIdentity(data.identity);
          await validateImportableDeviceKey(identity);
          return response(await this.pairing.join(id, data.secret, identity));
        }
        return response(await this.pairing.joinStatus(id, data.secret));
      }

      const signed = readSignedHeaders(request);
      const publicKey = this.journal.getActiveDevice(signed.deviceId);
      if (!publicKey) throw new SyncProtocolError(401, "Device is not paired with this space.");
      await verifyDeviceSignature(request, body, publicKey, signed);

      if (action === "changes" && request.method === "GET") {
        const { after, limit } = parsePullQuery(url);
        return response(this.journal.changes(signed.deviceId, signed.nonce, after, limit));
      }
      if (action === "changes" && request.method === "POST") {
        return response(this.journal.accept(
          signed.deviceId, signed.nonce, parseSyncPush(jsonObject(body), signed.deviceId)
        ));
      }
      if (action === "pairings" && request.method === "POST") {
        return response(await this.pairing.invite(signed.deviceId, signed.nonce), 201);
      }
      const invitation = /^pairings\/([0-9a-f-]{36})(?:\/(approve))?$/.exec(action);
      if (invitation) {
        const id = invitationId(invitation[1]);
        if (request.method === "GET" && !invitation[2]) {
          return response(this.pairing.inspectInvitation(signed.deviceId, signed.nonce, id));
        }
        if (request.method === "POST" && invitation[2] === "approve") {
          const data = jsonObject(body);
          if (typeof data.confirmation !== "string" || !/^[0-9]{6}$/.test(data.confirmation)) {
            throw new SyncProtocolError(400, "Confirmation code is invalid.");
          }
          return response(this.pairing.approve(signed.deviceId, signed.nonce, id, data.confirmation));
        }
      }
      if (action === "devices" && request.method === "GET") {
        return response(this.pairing.list(signed.deviceId, signed.nonce));
      }
      if (action.startsWith("devices/") && request.method === "DELETE") {
        const victim = action.slice("devices/".length);
        if (!/^[A-Za-z0-9_-]{8,128}$/.test(victim)) {
          throw new SyncProtocolError(400, "Invalid device ID.");
        }
        return response(this.pairing.revoke(signed.deviceId, signed.nonce, victim));
      }
      return response({ error: "Not found." }, 404);
    } catch (cause) {
      if (cause instanceof SyncProtocolError) return response({ error: cause.message }, cause.status);
      return response({ error: "Sync request failed." }, 500);
    }
  }
}
