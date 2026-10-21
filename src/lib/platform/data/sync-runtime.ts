import { readDeviceIdentity } from "./device-identity.ts";
import { syncNow } from "./sync-coordinator.ts";
import { explainSyncFailure } from "./sync-errors.ts";
import { globalDataPorts } from "./registry.ts";
import { SYNC_OUTBOX_COMMITTED_EVENT } from "./outbox.ts";

export type SyncHealth = "local" | "connecting" | "syncing" | "up-to-date" |
  "offline" | "needs-review" | "blocked" | "revoked" | "error";
export type SyncStatus = {
  kind: SyncHealth;
  updatedAt: number | null;
  pending: number;
  description: string;
};
const EVENT = "modu:sync-runtime-status";
const SHARED_CHANNEL = "modu-sync-network-activity";
export const SYNC_POLL_INTERVAL_MS = 90_000;
const FOCUS_POLL_MIN_GAP_MS = 20_000;
const DEBOUNCE_MS = 1_500;
const MAX_RETRY_MS = 300_000;

let current: SyncStatus = {
  kind: "local", updatedAt: null, pending: 0, description: "Stored on this device"
};
export function readSyncStatus(): SyncStatus { return { ...current }; }
function broadcast(status: SyncStatus): void {
  if (status.kind === current.kind && status.pending === current.pending &&
      status.updatedAt === current.updatedAt && status.description === current.description) return;
  current = status;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: status }));
  }
}
export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<SyncStatus>).detail);
  window.addEventListener(EVENT, handler);
  listener(readSyncStatus());
  return () => window.removeEventListener(EVENT, handler);
}

const ERROR_REVIEW = /conflict|concurrent|baseline|revision|manual resolution|immutable/i;
const ERROR_REVOKED = /revoked|not paired|unauthorized|\(401\)|\(403\)/i;
const ERROR_PERMANENT = /quota|retention limit|storage limit|payload size|\(507\)|\(413\)|\(400\)|\(409\)|\(422\)/i;
type Trigger = "startup" | "local" | "poll" | "focus" | "online" | "retry";

let activeRuntime: { owners: number; stop: () => void } | null = null;

/**
 * A single foreground scheduler per browser window. Only the committed
 * outbox event can initiate a local-change sync. Inbound remote applies and
 * generic component refresh notifications must never create feedback loops.
 */
export function startGlobalSyncRuntime(): () => void {
  if (activeRuntime) {
    const shared = activeRuntime;
    shared.owners++;
    return () => {
      shared.owners--;
      if (shared.owners === 0) { shared.stop(); if (activeRuntime === shared) activeRuntime = null; }
    };
  }

  let disposed = false;
  let busy = false;
  let paused = false;
  let dirtyDuringSync = false;
  let lastNetworkAt = 0;
  let backoff = 10_000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dueAt = Infinity;
  let scheduledReason: Trigger = "startup";
  let channel: BroadcastChannel | null = null;

  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(SHARED_CHANNEL);
      channel.onmessage = event => {
        if (event.data?.type === "completed" &&
            Number.isSafeInteger(event.data.at) &&
            event.data.at <= Date.now() && event.data.at > lastNetworkAt) {
          // Quiet polling by another tab in the same browser counts as a fresh
          // check. Never trigger another request in reaction to this message.
          lastNetworkAt = event.data.at;
        }
      };
    }
  } catch { channel = null; }

  const countPending = async (): Promise<number> => {
    let pending = 0;
    for (const port of globalDataPorts) {
      pending += (await port.readPendingSyncOperations(100)).length;
    }
    return pending;
  };
  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    dueAt = Infinity;
  };
  const run = async (reason: Trigger) => {
    if (disposed || busy || paused || document.visibilityState === "hidden") return;
    if (reason === "poll" && Date.now() - lastNetworkAt < SYNC_POLL_INTERVAL_MS) return;
    if (reason === "focus" && Date.now() - lastNetworkAt < FOCUS_POLL_MIN_GAP_MS) return;

    // Acquire single-flight before the asynchronous IndexedDB identity read.
    busy = true;
    try {
      const identity = await readDeviceIdentity();
      if (disposed) return;
      if (!identity || identity.status !== "paired") {
        broadcast({
          kind: identity ? "connecting" : "local", updatedAt: current.updatedAt,
          pending: 0, description: identity ? "Waiting for device approval" : "Stored on this device"
        });
        return;
      }
      if (!navigator.onLine) {
        let pending = current.pending;
        try { pending = await countPending(); } catch { /* previous status is safer */ }
        broadcast({ ...current, kind: "offline", pending,
          description: "Saved locally. Waiting for connection." });
        return;
      }
      // A passive poll should never flash "Syncing…" on an idle screen.
      if (reason !== "poll" && reason !== "focus" && current.kind !== "up-to-date") {
        broadcast({ ...current, kind: "syncing", description: "Syncing changes…" });
      }
      const progress = await syncNow(identity);
      if (disposed) return;
      const now = Date.now();
      lastNetworkAt = now;
      try { channel?.postMessage({ type: "completed", at: now }); }
      catch { /* optional multi-tab optimization */ }
      backoff = 10_000;
      // A no-op poll must not produce visible status churn.
      if (progress.pushed === 0 && progress.pulled === 0 &&
          current.kind === "up-to-date") return;
      const pending = await countPending();
      if (disposed) return;
      broadcast({
        kind: pending ? "syncing" : "up-to-date",
        updatedAt: now, pending,
        description: pending ? "More changes waiting to sync" : "Up to date on this device"
      });
      if (pending) dirtyDuringSync = true;
    } catch (cause) {
      if (disposed) return;
      const raw = cause instanceof Error ? cause.message : "";
      const kind: SyncHealth = ERROR_REVIEW.test(raw) ? "needs-review" :
        ERROR_REVOKED.test(raw) ? "revoked" :
        ERROR_PERMANENT.test(raw) ? "blocked" : "error";
      paused = kind !== "error";
      dirtyDuringSync = false;
      broadcast({ ...current, kind, description: explainSyncFailure(cause) });
      if (kind === "error") {
        schedule(backoff, "retry");
        backoff = Math.min(backoff * 2, MAX_RETRY_MS);
      }
    } finally {
      busy = false;
      if (dirtyDuringSync && !disposed && !paused) {
        dirtyDuringSync = false;
        schedule(DEBOUNCE_MS, "local");
      }
    }
  };

  // Preserve the earliest due work; repeated notifications never keep pushing
  // the timer forward or create parallel queued syncs.
  function schedule(delay: number, reason: Trigger): void {
    if (disposed || paused) return;
    if (busy && reason !== "retry") {
      if (reason === "local") dirtyDuringSync = true;
      return;
    }
    const nextDue = Date.now() + delay;
    if (timer !== null && nextDue >= dueAt) {
      if (reason === "local") scheduledReason = "local";
      return;
    }
    clearTimer();
    dueAt = nextDue;
    scheduledReason = reason;
    timer = setTimeout(() => {
      timer = null; dueAt = Infinity;
      const nextReason = scheduledReason;
      void run(nextReason);
    }, delay);
  }

  const changed = () => schedule(DEBOUNCE_MS, "local");
  const online = () => schedule(200, "online");
  const identityChanged = () => { paused = false; schedule(200, "startup"); };
  const visible = () => {
    if (document.visibilityState === "visible") schedule(250, "focus");
  };
  window.addEventListener(SYNC_OUTBOX_COMMITTED_EVENT, changed);
  window.addEventListener("online", online);
  window.addEventListener("modu:sync-identity-changed", identityChanged);
  window.addEventListener("focus", visible);
  document.addEventListener("visibilitychange", visible);
  const interval = setInterval(() => {
    if (document.visibilityState === "visible") schedule(200, "poll");
  }, SYNC_POLL_INTERVAL_MS);
  schedule(200, "startup");

  const stop = () => {
    disposed = true;
    clearTimer();
    clearInterval(interval);
    channel?.close();
    window.removeEventListener(SYNC_OUTBOX_COMMITTED_EVENT, changed);
    window.removeEventListener("online", online);
    window.removeEventListener("modu:sync-identity-changed", identityChanged);
    window.removeEventListener("focus", visible);
    document.removeEventListener("visibilitychange", visible);
  };
  const shared = { owners: 1, stop };
  activeRuntime = shared;
  return () => {
    shared.owners--;
    if (shared.owners === 0) { shared.stop(); if (activeRuntime === shared) activeRuntime = null; }
  };
}
