import { MODULE_DATA_IDS, type ModuleDataId } from "./contracts.ts";
import type { PendingSyncOperation, SyncOperationKind } from "./outbox.ts";

export const SYNC_MAX_BODY_BYTES = 256 * 1024;
export const SYNC_MAX_BATCH = 50;
export const SYNC_MAX_PULL = 100;

export type WireSyncOperation = Omit<PendingSyncOperation, "sequence">;
export type SequencedSyncOperation = WireSyncOperation & { sequence: number };
export type SyncPushReply = { accepted: { operationId: string; sequence: number }[] };
export type SyncPullReply = { operations: SequencedSyncOperation[]; nextCursor: number; hasMore: boolean };

export class SyncProtocolError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = "SyncProtocolError"; }
}

const validIdentifier = (x: unknown): x is string =>
  typeof x === "string" && x.length >= 1 && x.length <= 128 && /^[a-zA-Z0-9:_-]+$/.test(x);

export function parseSyncOperation(source: unknown, authenticatedDeviceId: string): WireSyncOperation {
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new SyncProtocolError(400, "Invalid sync operation.");
  const v = source as Record<string, unknown>;
  if (!validIdentifier(v.operationId) || !validIdentifier(v.deviceId) ||
      v.deviceId !== authenticatedDeviceId || !validIdentifier(v.entityId) ||
      !MODULE_DATA_IDS.includes(v.moduleId as ModuleDataId) ||
      !["baseline", "upsert", "delete", "command"].includes(v.kind as string) ||
      (v.baseRevision !== null && (typeof v.baseRevision !== "string" || v.baseRevision.length > 128)) ||
      typeof v.createdAt !== "number" || !Number.isSafeInteger(v.createdAt) || v.createdAt < 0 ||
      !Object.prototype.hasOwnProperty.call(v, "payload") ||
      v.payload === undefined || Object.prototype.hasOwnProperty.call(v, "sequence")) {
    throw new SyncProtocolError(400, "Invalid sync operation fields or device mismatch.");
  }
  return {
    operationId: v.operationId as string,
    deviceId: v.deviceId as string,
    moduleId: v.moduleId as ModuleDataId,
    entityId: v.entityId as string,
    kind: v.kind as SyncOperationKind,
    baseRevision: v.baseRevision as string | null,
    createdAt: v.createdAt as number,
    payload: v.payload
  };
}

export function parseSyncPush(source: unknown, authenticatedDeviceId: string): WireSyncOperation[] {
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new SyncProtocolError(400, "Invalid push envelope.");
  const operations = (source as Record<string, unknown>).operations;
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > SYNC_MAX_BATCH) {
    throw new SyncProtocolError(400, "Sync batches must contain 1–50 operations.");
  }
  const decoded = operations.map(item => parseSyncOperation(item, authenticatedDeviceId));
  if (new Set(decoded.map(x => x.operationId)).size !== decoded.length) {
    throw new SyncProtocolError(400, "Duplicate operation IDs in a batch.");
  }
  return decoded;
}

export function parsePullQuery(url: URL): { after: number; limit: number } {
  const keys = [...url.searchParams.keys()];
  if (keys.some(k => k !== "after" && k !== "limit") || new Set(keys).size !== keys.length) {
    throw new SyncProtocolError(400, "Invalid sync cursor parameters.");
  }
  const afterRaw = url.searchParams.get("after") ?? "0";
  const limitRaw = url.searchParams.get("limit") ?? String(SYNC_MAX_PULL);
  if (!/^(0|[1-9][0-9]*)$/.test(afterRaw) || !/^[1-9][0-9]*$/.test(limitRaw)) {
    throw new SyncProtocolError(400, "Malformed sync cursor or limit.");
  }
  const after = Number(afterRaw), limit = Number(limitRaw);
  if (!Number.isSafeInteger(after) || !Number.isSafeInteger(limit) || limit > SYNC_MAX_PULL) {
    throw new SyncProtocolError(400, "Sync cursor or limit is out of range.");
  }
  return { after, limit };
}
