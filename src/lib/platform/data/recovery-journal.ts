import type { GlobalBackupV1 } from "./contracts.ts";

const DATABASE = "modu-global-recovery";
const STORE = "journal";

export type RestoreJournal = {
  id: "active";
  createdAt: number;
  checkpoint: GlobalBackupV1;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("Global recovery database unavailable."));
    request.onblocked = () => reject(new Error("Another tab is blocking global recovery storage."));
  });
}

async function execute<T>(
  mode: IDBTransactionMode,
  enqueue: (store: IDBObjectStore, complete: (value: T) => void) => void
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let result: T;
      let assigned = false;
      tx.oncomplete = () => assigned ? resolve(result) : reject(new Error("Recovery transaction returned no result."));
      tx.onabort = () => reject(tx.error ?? new Error("Recovery transaction aborted."));
      tx.onerror = () => reject(tx.error ?? new Error("Recovery transaction failed."));
      try { enqueue(tx.objectStore(STORE), value => { result = value; assigned = true; }); }
      catch (cause) { try { tx.abort(); } catch { reject(cause); } }
    });
  } finally {
    db.close();
  }
}

export function readRestoreJournal(): Promise<RestoreJournal | null> {
  return execute("readonly", (store, complete) => {
    const request = store.get("active");
    request.onsuccess = () => complete((request.result as RestoreJournal | undefined) ?? null);
  });
}

export function createRestoreJournal(journal: RestoreJournal): Promise<void> {
  return execute("readwrite", (store, complete) => {
    // Refuse to replace a checkpoint from an earlier interrupted restore.
    const request = store.get("active");
    request.onsuccess = () => {
      if (request.result) {
        throwJournalError();
        return;
      }
      store.add(journal);
      complete(undefined);
    };
    function throwJournalError(): void {
      try { store.transaction.abort(); } catch { /* transaction already failed */ }
    }
  });
}

export function deleteRestoreJournal(): Promise<void> {
  return execute("readwrite", (store, complete) => {
    store.delete("active");
    complete(undefined);
  });
}
