import { afterEach, describe, expect, it, vi } from "vitest";
import { SyncTransport, readBoundedSyncJson } from "../../src/lib/platform/data/sync-transport.ts";
import { readSignedHeaders, verifyDeviceSignature } from "../../src/sync-worker/signature.ts";
import type { PendingSyncOperation } from "../../src/lib/platform/data/outbox.ts";

const SPACE = "00000000-1111-4222-8333-444444444444";
const DEVICE = "device-browser-123";
const operation: PendingSyncOperation = {
  sequence: 9, operationId: "op-1", deviceId: DEVICE, moduleId: "habit-tracker",
  entityId: "habit-1", kind: "upsert", baseRevision: null,
  payload: { title: "Study" }, createdAt: 1792520000000
};

afterEach(() => vi.unstubAllGlobals());

describe("M6 bounded browser response safety", () => {
  it("rejects oversized streaming responses even without Content-Length", async () => {
    const body = JSON.stringify({ operations: [], extra: "x".repeat(1_100_000) });
    const response = new Response(body, { status: 200 });
    response.headers.delete("content-length");
    await expect(readBoundedSyncJson(response)).rejects.toThrow("size limit");
  });
  it("rejects invalid JSON and malformed UTF-8", async () => {
    await expect(readBoundedSyncJson(new Response("not JSON"))).rejects.toThrow("invalid JSON");
    await expect(readBoundedSyncJson(new Response(new Uint8Array([0xff]))))
      .rejects.toThrow("invalid JSON");
  });
});
describe("explicit signed client transport", () => {
  it("signs all request fields, drops local sequence and validates server acknowledgement", async () => {
    vi.stubGlobal("location", { origin: "https://modu.example" });
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]
    );
    const jwk = JSON.stringify(await crypto.subtle.exportKey("jwk", keyPair.publicKey));
    let observed = false;
    const transport = new SyncTransport({
      spaceId: SPACE, deviceId: DEVICE, privateKey: keyPair.privateKey
    }, async (input, init) => {
      const request = new Request(input, init);
      expect(new URL(request.url).pathname).toBe("/api/sync/spaces/" + SPACE + "/changes");
      const body = await request.text();
      const headers = readSignedHeaders(request);
      expect(headers.deviceId).toBe(DEVICE);
      await verifyDeviceSignature(request, body, jwk, headers);
      const parsed = JSON.parse(body) as { operations: Record<string, unknown>[] };
      expect(parsed.operations).toHaveLength(1);
      expect(parsed.operations[0].sequence).toBeUndefined();
      observed = true;
      return new Response(JSON.stringify({ accepted: [{ operationId: "op-1", sequence: 42 }] }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    });
    await expect(transport.push([operation])).resolves.toMatchObject({
      accepted: [{ operationId: "op-1", sequence: 42 }]
    });
    expect(observed).toBe(true);
  });

  it("refuses incomplete acknowledgement without mutating the caller outbox", async () => {
    vi.stubGlobal("location", { origin: "https://modu.example" });
    const keys = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]
    );
    const transport = new SyncTransport({
      spaceId: SPACE, deviceId: DEVICE, privateKey: keys.privateKey
    }, async () => new Response(JSON.stringify({ accepted: [] }), { status: 200 }));
    await expect(transport.push([operation])).rejects.toThrow("Incomplete");
    expect(operation.sequence).toBe(9);
  });
});
