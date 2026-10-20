import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateDeviceIdentity, storeDeviceIdentity, readDeviceIdentity,
  markDevicePaired, clearDeviceIdentity
} from "../../src/lib/platform/data/device-identity.ts";
import { encodeRecoveryCode, decodeRecoveryCode, encodePairingCode, decodePairingCode } from "../../src/lib/platform/data/pairing-client.ts";

afterEach(() => vi.unstubAllGlobals());
describe("M5 local device key and recovery code", () => {
  it("keeps the ECDSA private key non-extractable and persists signing capability only in IndexedDB", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const created = await generateDeviceIdentity("Laptop");
    expect(created.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("jwk", created.privateKey)).rejects.toThrow();
    const spaceId = "00000000-1111-4222-8333-444444444444";
    await storeDeviceIdentity({ ...created, spaceId, id: "current", status: "pending", enrollmentKind: "owner" });
    const stored = await readDeviceIdentity();
    expect(stored?.status).toBe("pending");
    const content = new TextEncoder().encode("device-possession");
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, stored!.privateKey, content);
    const publicKey = await crypto.subtle.importKey("jwk", stored!.publicKey, {
      name: "ECDSA", namedCurve: "P-256"
    }, false, ["verify"]);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, signature, content)).toBe(true);
    await markDevicePaired();
    expect((await readDeviceIdentity())?.status).toBe("paired");
    await clearDeviceIdentity();
    expect(await readDeviceIdentity()).toBeNull();
  });
  it("exports/imports a complete recovery code and rejects malformed credentials", () => {
    const spaceId = "00000000-1111-4222-8333-444444444444";
    const secret = "A".repeat(43);
    expect(decodeRecoveryCode(encodeRecoveryCode(spaceId, secret))).toEqual({
      spaceId, recoveryKey: secret
    });
    expect(() => decodeRecoveryCode(secret)).toThrow();
    expect(() => encodeRecoveryCode(spaceId, "123456")).toThrow();
  });
  it("preserves the invitation secret without permitting malformed space IDs", () => {
    const spaceId = "00000000-1111-4222-8333-444444444444";
    const invite = "aaaabbbb-cccc-4ddd-8eee-123456789012";
    const secret = "Z".repeat(43);
    expect(decodePairingCode(encodePairingCode(spaceId, invite, secret))).toEqual({
      spaceId, invitationId: invite, secret
    });
    expect(() => decodePairingCode("other")).toThrow();
  });
});
