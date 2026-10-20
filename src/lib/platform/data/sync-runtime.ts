import { readDeviceIdentity } from "./device-identity.ts";
import { syncNow } from "./sync-coordinator.ts";
import { explainSyncFailure } from "./sync-errors.ts";
import { globalDataPorts } from "./registry.ts";
import { subscribeFocusSessions } from "#lib/shared/focus-sessions/repository.ts";
import { subscribeHabitChanges } from "#lib/modules/habit-tracker/adapters/persistence.ts";

export type SyncHealth = "local" | "connecting" | "syncing" | "up-to-date" |
  "offline" | "needs-review" | "revoked" | "error";
export type SyncStatus = {
  kind: SyncHealth;
  updatedAt: number | null;
  pending: number;
  description: string;
};
const EVENT = "modu:sync-runtime-status";
let current: SyncStatus = { kind: "local", updatedAt: null, pending: 0, description: "Stored on this device" };
export function readSyncStatus(): SyncStatus { return { ...current }; }
function broadcast(status: SyncStatus): void {
  current = status;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: status }));
}
export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<SyncStatus>).detail);
  window.addEventListener(EVENT, handler);
  listener(readSyncStatus());
  return () => window.removeEventListener(EVENT, handler);
}
const ERROR_REVIEW = /conflict|concurrent|baseline|revision|manual resolution|immutable/i;
const ERROR_REVOKED = /revoked|not paired|unauthorized|\(401\)|\(403\)/i;
/**
 * One scheduler per mounted app shell. It only runs after a stored device has
 * opted in and become paired; no uploads for local-only users.
 */
export function startGlobalSyncRuntime(): () => void {
  let disposed = false;
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let backoff = 3_000;
  const cleanTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const schedule = (delay: number) => {
    if (disposed) return;
    cleanTimer();
    timer = setTimeout(() => { timer = null; void run(); }, delay);
  };
  const countPending = async (): Promise<number> => {
    let pending = 0;
    for (const port of globalDataPorts) pending += (await port.readPendingSyncOperations(100)).length;
    return pending;
  };
  const run = async () => {
    if (disposed || busy) return;
    if (document.visibilityState === "hidden") return;
    let identity;
    try { identity = await readDeviceIdentity(); }
    catch (cause) {
      broadcast({ ...current, kind: "error", description: explainSyncFailure(cause) });
      return;
    }
    if (disposed) return;
    if (!identity || identity.status !== "paired") {
      broadcast({ kind: identity ? "connecting" : "local", updatedAt: current.updatedAt, pending: 0,
        description: identity ? "Waiting for device approval" : "Stored on this device" });
      return;
    }
    if (!navigator.onLine) {
      let pending = current.pending;
      try { pending = await countPending(); } catch { /* retained from previous status */ }
      broadcast({ ...current, kind: "offline", pending, description: "Saved locally. Waiting for connection." });
      return;
    }
    busy = true;
    broadcast({ ...current, kind: "syncing", description: "Syncing changes…" });
    try {
      await syncNow(identity);
      const pending = await countPending();
      if (disposed) return;
      const now = Date.now();
      backoff = 3_000;
      broadcast({ kind: pending ? "syncing" : "up-to-date", updatedAt: now, pending,
        description: pending ? "More changes waiting to sync" : "Up to date on this device" });
      if (pending) schedule(1_500);
    } catch (cause) {
      if (disposed) return;
      const raw = cause instanceof Error ? cause.message : "";
      const kind: SyncHealth = ERROR_REVIEW.test(raw) ? "needs-review" :
        ERROR_REVOKED.test(raw) ? "revoked" : "error";
      broadcast({ ...current, kind, description: explainSyncFailure(cause) });
      if (kind === "error") { schedule(backoff); backoff = Math.min(backoff * 2, 60_000); }
    } finally { busy = false; }
  };
  const changed = () => schedule(1_500);
  const online = () => schedule(100);
  const visible = () => { if (document.visibilityState === "visible") schedule(100); };
  const unsubscribeFocus = subscribeFocusSessions(changed);
  const unsubscribeHabit = subscribeHabitChanges(changed);
  window.addEventListener("online", online);
  window.addEventListener("focus", visible);
  window.addEventListener("modu:sync-identity-changed", online);
  document.addEventListener("visibilitychange", visible);
  const interval = setInterval(() => { if (!busy && document.visibilityState === "visible") schedule(200); }, 45_000);
  schedule(200);
  return () => {
    disposed = true; cleanTimer(); clearInterval(interval);
    unsubscribeFocus(); unsubscribeHabit();
    window.removeEventListener("online", online);
    window.removeEventListener("focus", visible);
    window.removeEventListener("modu:sync-identity-changed", online);
    document.removeEventListener("visibilitychange", visible);
  };
}
