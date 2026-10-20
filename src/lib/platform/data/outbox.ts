import type { ModuleDataId } from "./contracts.ts";

/**
 * Feature-owned IndexedDB outbox. Domain data and queued operations MUST share
 * the same IDB readwrite transaction. No network effects occur in this module.
 * Disabled by default until initial snapshot/device pairing are implemented.
 */
export const OUTBOX_STORE = "sync_outbox";
export const SYNC_META_STORE = "sync_metadata";
const CAPTURE_KEY = "capture";

export type SyncOperationKind = "upsert" | "delete" | "command" | "baseline";

export type PendingSyncOperation = {
  sequence?: number;
  operationId: string;
  moduleId: ModuleDataId;
  deviceId: string;
  entityId: string;
  kind: SyncOperationKind;
  baseRevision: string | null;
  payload: unknown;
  createdAt: number;
};

type CaptureMetadata = {
  key: typeof CAPTURE_KEY;
  enabled: true;
  deviceId: string;
};

export function ensureOutboxStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
    const store = db.createObjectStore(OUTBOX_STORE, { keyPath: "sequence", autoIncrement: true });
    store.createIndex("operationId", "operationId", { unique: true });
  }
  if (!db.objectStoreNames.contains(SYNC_META_STORE)) {
    db.createObjectStore(SYNC_META_STORE, { keyPath: "key" });
  }
}

function newOperation(
  moduleId: ModuleDataId, deviceId: string, entityId: string,
  kind: SyncOperationKind, payload: unknown, baseRevision: string | null
): PendingSyncOperation {
  if (!entityId || !deviceId || payload === undefined) {
    throw new Error("Sync operation requires a device, entity and serializable payload.");
  }
  return {
    operationId: crypto.randomUUID(), moduleId, deviceId, entityId,
    kind, baseRevision, payload, createdAt: Date.now()
  };
}

/** Called before a transaction completes, never after a separate domain commit. */
export function queueLocalMutation(
  tx: IDBTransaction, moduleId: ModuleDataId, entityId: string,
  kind: Exclude<SyncOperationKind, "baseline">,
  payload: unknown, baseRevision: string | null = null
): void {
  const request = tx.objectStore(SYNC_META_STORE).get(CAPTURE_KEY);
  request.onsuccess = () => {
    const config: unknown = request.result;
    if (config === undefined) return; // local-only is the default
    if (!config || typeof config !== "object" || Array.isArray(config) ||
        (config as Record<string, unknown>).enabled !== true ||
        typeof (config as Record<string, unknown>).deviceId !== "string") {
      tx.abort(); // fail closed on malformed sync state
      return;
    }
    const deviceId = (config as CaptureMetadata).deviceId;
    tx.objectStore(OUTBOX_STORE).add(
      newOperation(moduleId, deviceId, entityId, kind, payload, baseRevision)
    );
  };
}

/**
 * M5 pairing will call this from the owning module's transaction after
 * reading its authoritative baseline inside that SAME transaction.
 * An entire module baseline must be queued before capture becomes enabled.
 */
export function initializeCaptureWithBaseline(
  tx: IDBTransaction, moduleId: ModuleDataId,
  deviceId: string, baseline: unknown
): void {
  if (typeof deviceId !== "string" || !deviceId.trim() || baseline === undefined) {
    throw new Error("Cannot initialize sync without device identity and module baseline.");
  }
  const metadata = tx.objectStore(SYNC_META_STORE);
  const existing = metadata.get(CAPTURE_KEY);
  existing.onsuccess = () => {
    if (existing.result) {
      const config: unknown = existing.result;
      if (config && typeof config === "object" &&
          (config as Record<string, unknown>).enabled === true &&
          (config as Record<string, unknown>).deviceId === deviceId) {
        // Safe idempotent resume of partially enrolled multi-module setup.
        return;
      }
      tx.abort(); // another device/generation cannot silently take over
      return;
    }
    tx.objectStore(OUTBOX_STORE).add(
      newOperation(moduleId, deviceId, "module", "baseline", baseline, null)
    );
    metadata.add({ key: CAPTURE_KEY, enabled: true, deviceId } satisfies CaptureMetadata);
  };
}

/** Restore invalidates all operations captured against the previous generation. */
export function resetCaptureAfterRestore(tx: IDBTransaction): void {
  tx.objectStore(OUTBOX_STORE).clear();
  tx.objectStore(SYNC_META_STORE).delete(CAPTURE_KEY);
}

function isOperation(value: unknown): value is PendingSyncOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const x = value as Record<string, unknown>;
  return typeof x.operationId === "string" && typeof x.deviceId === "string" &&
    typeof x.entityId === "string" && typeof x.createdAt === "number" &&
    (x.kind === "upsert" || x.kind === "delete" || x.kind === "command" || x.kind === "baseline") &&
    (x.moduleId === "pomodoro" || x.moduleId === "habit-tracker" || x.moduleId === "language-learning") &&
    (x.baseRevision === null || typeof x.baseRevision === "string") &&
    Number.isSafeInteger(x.sequence) && (x.sequence as number) > 0 && "payload" in x;
}

export async function readOutbox(
  db: IDBDatabase, moduleId: ModuleDataId, limit = 100
): Promise<PendingSyncOperation[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new RangeError("Outbox page size must be between 1 and 500.");
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readonly");
    const req = tx.objectStore(OUTBOX_STORE).getAll(undefined, limit);
    let records: PendingSyncOperation[] = [];
    req.onsuccess = () => {
      if (!Array.isArray(req.result) || !req.result.every(isOperation) ||
        req.result.some((item: PendingSyncOperation) => item.moduleId !== moduleId)) {
        tx.abort();
        return;
      }
      records = req.result;
    };
    tx.oncomplete = () => resolve(records);
    tx.onabort = () => reject(tx.error ?? new Error("Outbox is corrupt or unavailable."));
    tx.onerror = () => reject(tx.error ?? new Error("Outbox read failed."));
  });
}

export async function acknowledgeOutbox(
  db: IDBDatabase, operationIds: readonly string[]
): Promise<void> {
  if (operationIds.length === 0) return;
  if (operationIds.some(id => typeof id !== "string" || !id) ||
      new Set(operationIds).size !== operationIds.length) {
    throw new Error("Duplicate or invalid outbox acknowledgements.");
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    const store = tx.objectStore(OUTBOX_STORE);
    const byId = store.index("operationId");
    for (const id of operationIds) {
      const request = byId.getKey(id);
      request.onsuccess = () => {
        if (request.result !== undefined) store.delete(request.result);
      };
    }
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Outbox acknowledgement aborted."));
    tx.onerror = () => reject(tx.error ?? new Error("Outbox acknowledgement failed."));
  });
}

/**
 * Join/recovery browsers must apply the owner journal BEFORE local capture.
 * This primitive refuses activation until a remote cursor exists; it does
 * not re-export an old baseline or mutate domain records.
 */
export function activateCaptureFromRemote(
  tx: IDBTransaction, deviceId: string, moduleId: ModuleDataId
): void {
  if (typeof deviceId !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(deviceId)) {
    throw new Error("Invalid device identity for remote capture.");
  }
  const meta = tx.objectStore(SYNC_META_STORE);
  const capture = meta.get(CAPTURE_KEY);
  capture.onsuccess = () => {
    if (capture.result) {
      if (capture.result.enabled === true && capture.result.deviceId === deviceId) return;
      tx.abort();
      return;
    }
    const cursor = meta.get("remote-cursor");
    cursor.onsuccess = () => {
      if (!Number.isSafeInteger(cursor.result?.sequence) || cursor.result.sequence < 1) {
        tx.abort(); return;
      }
      const inbox = tx.objectStore("sync_inbox").getAll();
      inbox.onsuccess = () => {
        const imported = Array.isArray(inbox.result) && inbox.result.some((item: {
          moduleId?: string; kind?: string; deviceId?: string
        }) => item.moduleId === moduleId && item.kind === "baseline" && item.deviceId !== deviceId);
        if (!imported) { tx.abort(); return; }
        const pending = tx.objectStore(OUTBOX_STORE).count();
        pending.onsuccess = () => {
          if (pending.result !== 0) { tx.abort(); return; }
          meta.put({ key: CAPTURE_KEY, enabled: true, deviceId } satisfies CaptureMetadata);
        };
      };
    };
  };
}
