import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { preflightSyncBaseline } from "../../src/lib/platform/data/setup-flow.ts";
import type { ModuleDataPort } from "../../src/lib/platform/data/contracts.ts";
import {
  readDeviceIdentity, readPendingPairing, clearDeviceIdentity, clearPendingPairing
} from "../../src/lib/platform/data/device-identity.ts";
import { requestDeviceJoin, resumeDeviceJoin } from "../../src/lib/platform/data/pairing-flow.ts";
import { encodePairingCode } from "../../src/lib/platform/data/pairing-client.ts";
function port(moduleId: ModuleDataPort["moduleId"], data: unknown): ModuleDataPort {
  return { moduleId, backupVersion: 1,
    inspect: async () => ({moduleId,backupVersion:1,recordCount:0,state:"empty"}),
    exportBackup: async () => data };
}
describe("M2 single-action setup preflight", () => {
  it("permits all small module snapshots without mutating storage", async () => {
    await expect(preflightSyncBaseline([
      port("pomodoro",{sessions:[]}),port("habit-tracker",{habits:[]}),
      port("language-learning",{profiles:[]})
    ])).resolves.toBeUndefined();
  });
  it("fails closed on unsupported initial payload sizes", async () => {
    await expect(preflightSyncBaseline([port("habit-tracker",{text:"x".repeat(190000)})]))
      .rejects.toThrow("Download a global backup");
  });
  it("rejects unserializable snapshots before contacting server", async () => {
    await expect(preflightSyncBaseline([port("pomodoro",undefined)]))
      .rejects.toThrow("not serializable");
  });
});
const CODE=encodePairingCode(
  "00000000-1111-4222-8333-444444444444",
  "00000000-1111-4222-8333-555555555555",
  "A".repeat(43)
);
beforeEach(async () => {
  await new Promise<void>((resolve,reject)=>{
    const req=indexedDB.deleteDatabase("modu-device-identity");
    req.onsuccess=()=>resolve(); req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error("Leaked device identity connection"));
  });
  vi.useFakeTimers({toFake:["Date"]});
  vi.setSystemTime(new Date("2026-10-21T08:00:00Z"));
});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe("M3 pending invitation survives reload and network failure", () => {
  it("persists original signing key and confirmation for pending join", async () => {
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({
      status:"pending",confirmation:"123456"
    }),{status:200})));
    const code=await requestDeviceJoin(CODE,"My Phone");
    expect(code).toBe("123456");
    const original=await readDeviceIdentity();
    expect(original?.status).toBe("pending");
    const stored=await readPendingPairing();
    expect(stored?.confirmation).toBe("123456");
    expect(stored?.invitationCode).toBe(CODE);
    expect((await readDeviceIdentity())?.deviceId).toBe(original?.deviceId);
  });
  it("retries an unanswered join with the same key after a safe status check", async () => {
    let calls=0;
    vi.stubGlobal("fetch",vi.fn(async (_input:RequestInfo|URL)=>{
      calls++;
      if(calls===1) throw new TypeError("Simulated lost request");
      if(calls===2) return new Response(JSON.stringify({status:"awaiting-device",confirmation:null}),{status:200});
      return new Response(JSON.stringify({status:"pending",confirmation:"654321"}),{status:200});
    }));
    await expect(requestDeviceJoin(CODE,"My Phone")).rejects.toThrow("Simulated lost request");
    const original=await readDeviceIdentity();
    expect((await readPendingPairing())?.confirmation).toBeNull();
    vi.setSystemTime(new Date("2026-10-21T08:00:16Z"));
    const state=await resumeDeviceJoin();
    expect(state).toEqual({phase:"waiting",confirmation:"654321"});
    expect((await readDeviceIdentity())?.deviceId).toBe(original?.deviceId);
    expect(calls).toBe(3);
  });
});
