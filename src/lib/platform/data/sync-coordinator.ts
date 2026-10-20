import { globalDataPorts } from "./registry.ts";
import { pairedTransport } from "./pairing-client.ts";
import type { StoredDeviceIdentity } from "./device-identity.ts";

export interface SyncProgress {
  pushed: number;
  pulled: number;
  cursor: number;
  modules: number;
}

/**
 * Explicit sync operation, called by opt-in foreground scheduler or manual retry.
 * Push must finish before pull to avoid merging unacknowledged local writes.
 * Each module independently advances its durable cursor in the same IDB
 * transaction as domain apply; retry starts from the minimum module cursor.
 */
export async function syncNow(
  identity: StoredDeviceIdentity,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncProgress> {
  if (identity.status !== "paired") throw new Error("Device must be approved before synchronization.");
  if (!navigator.locks?.request) throw new Error("Web Locks support is required for safe sync.");
  const transport = pairedTransport(identity);
  return navigator.locks.request("modu-global-restore", { mode: "exclusive" }, async () => {
    const progress: SyncProgress = { pushed: 0, pulled: 0, cursor: 0, modules: globalDataPorts.length };
    // Never batch/merge operations from different feature DBs before feature-owned read.
    for (const module of globalDataPorts) {
      for (let batch = 0; batch < 100; batch++) {
        const pending = await module.readPendingSyncOperations(30);
        if (pending.length === 0) break;
        const accepted = await transport.push(pending);
        // SyncTransport validates exact ID/sequence correspondence before returning.
        await module.acknowledgeSyncOperations(accepted.accepted.map(row => row.operationId));
        progress.pushed += accepted.accepted.length;
        onProgress?.({ ...progress });
        if (batch === 99) throw new Error("Pending sync queue is too large. Repeat sync to continue.");
      }
    }
    for (let page = 0; page < 100; page++) {
      const cursors = await Promise.all(globalDataPorts.map(port => port.readRemoteCursor()));
      const after = Math.min(...cursors);
      const incoming = await transport.pull(after, 100);
      if (incoming.operations.length) {
        for (const module of globalDataPorts) {
          await module.applyRemoteChanges(incoming.operations);
        }
      }
      progress.pulled += incoming.operations.length;
      progress.cursor = incoming.nextCursor;
      onProgress?.({ ...progress });
      if (!incoming.hasMore) {
        // After importing the owner baseline, joined/recovered devices begin
        // capturing new edits without uploading a duplicate baseline.
        if (identity.enrollmentKind !== "owner") {
          for (const module of globalDataPorts) {
            await module.beginRemoteSyncCapture(identity.deviceId);
          }
        }
        return progress;
      }
      if (page === 99) throw new Error("More changes remain; run Sync now again.");
    }
    throw new Error("Unable to finish incremental synchronization.");
  });
}
