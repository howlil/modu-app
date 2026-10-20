import type { PendingSyncOperation } from "./outbox.ts";
import {
  parseSyncOperation, validatePushReply, validatePullReply, SYNC_MAX_BATCH, SYNC_MAX_BODY_BYTES, SYNC_MAX_PULL,
  type SyncPullReply, type SyncPushReply
} from "./sync-protocol.ts";
import { signedRequestBytes } from "../../../sync-worker/signature.ts";

export type AuthorizedDevice = {
  spaceId: string;
  deviceId: string;
  privateKey: CryptoKey;
};

function base64url(bytes: Uint8Array): string {
  let encoded = "";
  for (const byte of bytes) encoded += String.fromCharCode(byte);
  return btoa(encoded).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * M4 explicit transport only: never automatically uploads or acknowledges data.
 * M5 will supply authenticated device keys from approved pairing.
 * Pull must be applied through feature-owned transaction/cursor ports first.
 */
const MAX_RESPONSE_BYTES = 1024 * 1024;

/** Streaming reply limit; the Content-Length header is not a trust boundary. */
export async function readBoundedSyncJson(response: Response): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared && Number(declared) > MAX_RESPONSE_BYTES) {
    throw new Error("Sync response exceeds the supported size limit.");
  }
  if (!response.body) throw new Error("Sync response was empty.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel("Response too large.");
        throw new Error("Sync response exceeds the supported size limit.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const payload = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload)) as unknown;
  } catch {
    throw new Error("Sync service returned invalid JSON.");
  }
}

export class SyncTransport {
  constructor(
    private readonly device: AuthorizedDevice,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(device.spaceId) ||
        !/^[a-zA-Z0-9_-]{8,128}$/.test(device.deviceId) ||
        device.privateKey.type !== "private" ||
        device.privateKey.algorithm.name !== "ECDSA") {
      throw new Error("Invalid paired device credentials.");
    }
  }

  private async send(method: "GET" | "POST" | "DELETE", relative: string, body = ""): Promise<Response> {
    const url = new URL(relative, location.origin);
    if (url.origin !== location.origin) throw new Error("Cross-origin sync is not supported.");
    const timestamp = Date.now();
    const nonce = base64url(crypto.getRandomValues(new Uint8Array(24)));
    const input = await signedRequestBytes(method, url, timestamp, nonce, body);
    const signature = new Uint8Array(await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" }, this.device.privateKey, input
    ));
    const headers: HeadersInit = {
      "x-modu-device": this.device.deviceId,
      "x-modu-timestamp": String(timestamp),
      "x-modu-nonce": nonce,
      "x-modu-signature": base64url(signature)
    };
    if (method === "POST") headers["content-type"] = "application/json";
    const response = await this.fetchImpl(url.toString(), {
      method, headers, body: method === "POST" ? body : undefined,
      cache: "no-store", credentials: "omit"
    });
    if (!response.ok) throw new Error("Sync transport error (" + response.status + ").");
    return response;
  }

  /** Signed control operations. Enrollment requires explicit user approval. */
  async control<T>(method: "GET" | "POST" | "DELETE", action: string, payload?: unknown): Promise<T> {
    if (!/^(?:pairings|pairings\/[0-9a-f-]{36}(?:\/approve)?|devices|devices\/[a-zA-Z0-9_-]{8,128})$/.test(action)) {
      throw new Error("Invalid pairing control route.");
    }
    const route = "/api/sync/spaces/" + this.device.spaceId + "/" + action;
    const body = method === "POST" ? JSON.stringify(payload ?? {}) : "";
    return await readBoundedSyncJson(await this.send(method, route, body)) as T;
  }

  async push(operations: readonly PendingSyncOperation[]): Promise<SyncPushReply> {
    if (operations.length < 1 || operations.length > SYNC_MAX_BATCH) {
      throw new Error("Sync push requires 1–50 operations.");
    }
    const wire = operations.map(operation => parseSyncOperation(
      (({ sequence: _sequence, ...rest }) => rest)(operation), this.device.deviceId
    ));
    const body = JSON.stringify({ operations: wire });
    if (new TextEncoder().encode(body).byteLength > SYNC_MAX_BODY_BYTES) {
      throw new Error("Sync batch exceeds the payload size limit.");
    }
    const route = "/api/sync/spaces/" + this.device.spaceId + "/changes";
    const result: unknown = await readBoundedSyncJson(await this.send("POST", route, body));
    return validatePushReply(result, wire.map(x => x.operationId));
  }

  async pull(after: number, limit = SYNC_MAX_PULL): Promise<SyncPullReply> {
    if (!Number.isSafeInteger(after) || after < 0 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > SYNC_MAX_PULL) {
      throw new Error("Invalid sync cursor or batch size.");
    }
    const route = "/api/sync/spaces/" + this.device.spaceId +
      "/changes?after=" + after + "&limit=" + limit;
    const result: unknown = await readBoundedSyncJson(await this.send("GET", route));
    return validatePullReply(result, after, limit);
  }
}
