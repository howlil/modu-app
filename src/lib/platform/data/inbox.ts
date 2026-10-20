import type { ModuleDataId } from "./contracts.ts";
import type { SequencedSyncOperation } from "./sync-protocol.ts";
import { OUTBOX_STORE, SYNC_META_STORE } from "./outbox.ts";

export const INBOX_STORE = "sync_inbox";
export const TOMBSTONE_STORE = "sync_tombstones";
const CURSOR_KEY = "remote-cursor";
const CAPTURE_KEY = "capture";
export class RemoteApplyConflict extends Error {
  constructor(message: string) { super(message); this.name = "RemoteApplyConflict"; }
}
export function ensureInboxStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(INBOX_STORE)) {
    db.createObjectStore(INBOX_STORE, { keyPath: "operationId" });
  }
  if (!db.objectStoreNames.contains(TOMBSTONE_STORE)) {
    db.createObjectStore(TOMBSTONE_STORE, { keyPath: "id" });
  }
}
export function resetInboxAfterRestore(tx: IDBTransaction): void {
  tx.objectStore(INBOX_STORE).clear();
  tx.objectStore(TOMBSTONE_STORE).clear();
  tx.objectStore(SYNC_META_STORE).delete(CURSOR_KEY);
}
function sortedEvents(events: readonly SequencedSyncOperation[]): void {
  let last = -1;
  for (const event of events) {
    if (!Number.isSafeInteger(event.sequence) || event.sequence <= last ||
        event.sequence <= 0) {
      throw new RemoteApplyConflict("Incoming sync batch is not strictly ordered.");
    }
    last = event.sequence;
  }
}
export function readInboxCursor(db: IDBDatabase): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_META_STORE, "readonly");
    const req = tx.objectStore(SYNC_META_STORE).get(CURSOR_KEY);
    let cursor = 0;
    req.onsuccess = () => {
      const item = req.result;
      if (item !== undefined && (!Number.isSafeInteger(item.sequence) || item.sequence < 0)) {
        tx.abort(); return;
      }
      cursor = item?.sequence ?? 0;
    };
    tx.oncomplete = () => resolve(cursor);
    tx.onabort = () => reject(tx.error ?? new RemoteApplyConflict("Corrupt inbox cursor."));
    tx.onerror = () => reject(tx.error ?? new Error("Cannot read sync cursor."));
  });
}
/**
 * Feature transaction must include ALL relevant domain stores, metadata,
 * outbox, inbox and tombstones. Callback must finish asynchronously via IDB
 * request handlers, without awaiting network, timers, or unrelated transactions.
 */
export function applyIncomingInTransaction(
  tx: IDBTransaction, moduleId: ModuleDataId,
  events: readonly SequencedSyncOperation[],
  applyOne: (event: SequencedSyncOperation, next: () => void, fail: (cause: Error) => void) => void,
  done: () => void,
  fail: (cause: Error) => void
): void {
  sortedEvents(events);
  const meta = tx.objectStore(SYNC_META_STORE);
  const inbox = tx.objectStore(INBOX_STORE);
  const cursorReq = meta.get(CURSOR_KEY);
  cursorReq.onsuccess = () => {
    const stored: unknown = cursorReq.result;
    if (stored !== undefined && (!stored || typeof stored !== "object" ||
        !Number.isSafeInteger((stored as {sequence?:number}).sequence))) {
      fail(new RemoteApplyConflict("Stored sync cursor is corrupt.")); return;
    }
    let cursor = (stored as {sequence?:number}|undefined)?.sequence ?? 0;
    const pending = tx.objectStore(OUTBOX_STORE).count();
    pending.onsuccess = () => {
      const capture = meta.get(CAPTURE_KEY);
      capture.onsuccess = () => {
        const localDeviceId: unknown = capture.result?.deviceId;
        const incoming = events.filter(item => item.sequence > cursor);
        const foreign = incoming.filter(item => item.moduleId === moduleId &&
          item.deviceId !== localDeviceId);
        if (pending.result > 0 && foreign.length > 0) {
          fail(new RemoteApplyConflict("Push local pending changes before applying remote changes."));
          return;
        }
        let index = 0;
        const step = () => {
          if (index >= incoming.length) {
            meta.put({ key: CURSOR_KEY, sequence: cursor });
            done();
            return;
          }
          const item = incoming[index++];
          const previous = inbox.get(item.operationId);
          previous.onsuccess = () => {
            if (previous.result) {
              fail(new RemoteApplyConflict("Remote operation ID replay outside its cursor range."));
              return;
            }
            const finish = () => {
              inbox.add({ operationId: item.operationId, sequence: item.sequence, moduleId: item.moduleId, kind: item.kind, deviceId: item.deviceId });
              cursor = item.sequence;
              step();
            };
            if (item.moduleId !== moduleId || item.deviceId === localDeviceId) {
              finish();
              return;
            }
            try { applyOne(item, finish, fail); }
            catch (cause) { fail(cause instanceof Error ? cause : new RemoteApplyConflict("Remote apply failed.")); }
          };
        };
        step();
      };
    };
  };
}
