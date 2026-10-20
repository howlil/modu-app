import type { AuthorizedDevice } from "./sync-transport.ts";

/** Non-extractable signing private key is structured-cloned into IndexedDB. */
export interface StoredDeviceIdentity extends AuthorizedDevice {
  id: "current";
  name: string;
  publicKey: JsonWebKey;
  status: "pending" | "paired";
  enrollmentKind: "owner" | "join" | "recovery";
}
export type NewDeviceIdentity = Omit<StoredDeviceIdentity, "id" | "spaceId" | "status" | "enrollmentKind">;

const DATABASE = "modu-device-identity";
const STORE = "identity";
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("Device credential storage unavailable."));
    request.onblocked = () => reject(new Error("Close other Modu tabs before upgrading device credentials."));
  });
}
async function operation<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore, done: (result: T) => void) => void
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let result: T;
      let filled = false;
      tx.oncomplete = () => filled ? resolve(result) : reject(new Error("Incomplete credential transaction."));
      tx.onabort = () => reject(tx.error ?? new Error("Credential transaction aborted."));
      tx.onerror = () => reject(tx.error ?? new Error("Credential storage failed."));
      try { fn(tx.objectStore(STORE), x => { result = x; filled = true; }); }
      catch (error) { tx.abort(); reject(error); }
    });
  } finally { db.close(); }
}
export async function readDeviceIdentity(): Promise<StoredDeviceIdentity | null> {
  return operation("readonly", (store, done) => {
    const read = store.get("current");
    read.onsuccess = () => done((read.result as StoredDeviceIdentity | undefined) ?? null);
  });
}
export async function storeDeviceIdentity(identity: StoredDeviceIdentity): Promise<void> {
  if (!identity.spaceId || !identity.deviceId || identity.privateKey.type !== "private" ||
      identity.privateKey.extractable) throw new Error("Invalid non-extractable device identity.");
  return operation("readwrite", (store, done) => {
    store.put(identity);
    done(undefined);
  });
}
export async function markDevicePaired(): Promise<void> {
  return operation("readwrite", (store, done) => {
    const request = store.get("current");
    request.onsuccess = () => {
      const data = request.result as StoredDeviceIdentity | undefined;
      if (!data) { store.transaction.abort(); return; }
      store.put({ ...data, status: "paired" });
      done(undefined);
    };
  });
}
export async function clearDeviceIdentity(): Promise<void> {
  return operation("readwrite", (store, done) => { store.delete("current"); done(undefined); });
}
export async function generateDeviceIdentity(name: string): Promise<NewDeviceIdentity> {
  if (!name.trim() || name.trim().length > 60) throw new Error("Device name must be 1–60 characters.");
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]
  );
  const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
  return { deviceId: "device_" + crypto.randomUUID().replace(/-/g, ""),
    name: name.trim(), publicKey, privateKey: keys.privateKey };
}
