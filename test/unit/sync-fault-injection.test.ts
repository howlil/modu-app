import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncTransport } from "../../src/lib/platform/data/sync-transport.ts";
import {
  saveFocusSession, beginFocusSyncCapture,
  readFocusPendingSyncOperations, acknowledgeFocusSyncOperations
} from "../../src/lib/shared/focus-sessions/repository.ts";

const SPACE = "00000000-1111-4222-8333-444444444444";
const DEVICE = "device_simulated_01";

beforeEach(async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); }
  });
  vi.stubGlobal("location", { origin: "https://modu.example" });
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("module-pomodoro-activity");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Activity IndexedDB is blocked."));
  });
});
afterEach(() => vi.unstubAllGlobals());

async function queuedOperation() {
  await saveFocusSession({
    id: "saved-focus", startedAt: 1000, endedAt: 2000,
    plannedDurationMs: 1000, actualDurationMs: 1000,
    overtimeMs: 0, label: "Offline writing", goalMs: 3600000, status: "completed"
  });
  await beginFocusSyncCapture(DEVICE);
  const pending = await readFocusPendingSyncOperations();
  expect(pending).toHaveLength(1);
  return pending;
}

async function transport(handler: (request: Request) => Promise<Response>) {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]
  );
  return new SyncTransport({ spaceId: SPACE, deviceId: DEVICE, privateKey: pair.privateKey },
    async (input, init) => handler(new Request(input, init)));
}

describe("M6 interrupted sync and lost ACK", () => {
  it("preserves the exact outbox operation after a lost network response, then retries safely", async () => {
    const pending = await queuedOperation();
    let received = 0;
    const client = await transport(async () => {
      received++;
      if (received === 1) throw new TypeError("Simulated connection lost after server commit");
      return new Response(JSON.stringify({ accepted: [{
        operationId: pending[0].operationId, sequence: 18
      }] }), { status: 200 });
    });
    await expect(client.push(pending)).rejects.toThrow("connection lost");
    expect((await readFocusPendingSyncOperations()).map(x => x.operationId))
      .toEqual(pending.map(x => x.operationId));
    const ack = await client.push(await readFocusPendingSyncOperations());
    await acknowledgeFocusSyncOperations(ack.accepted.map(x => x.operationId));
    expect(await readFocusPendingSyncOperations()).toHaveLength(0);
    expect(received).toBe(2);
  });

  it("rejects a 507 SQLite retention limit response without acknowledging local data", async () => {
    const pending = await queuedOperation();
    const client = await transport(async () => new Response(JSON.stringify({
      error: "Sync space has reached its retention limit."
    }), { status: 507 }));
    await expect(client.push(pending)).rejects.toThrow("507");
    expect((await readFocusPendingSyncOperations()).map(x => x.operationId))
      .toEqual(pending.map(x => x.operationId));
  });

  it("rejects a server acknowledgement that repeats an operation ID", async () => {
    const pending = await queuedOperation();
    const client = await transport(async () => new Response(JSON.stringify({
      accepted: [
        { operationId: pending[0].operationId, sequence: 11 },
        { operationId: pending[0].operationId, sequence: 12 }
      ]
    }), { status: 200 }));
    await expect(client.push(pending)).rejects.toThrow();
    expect(await readFocusPendingSyncOperations()).toHaveLength(1);
  });
});
