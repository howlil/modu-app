import {
  generateDeviceIdentity, storeDeviceIdentity, readDeviceIdentity,
  markDevicePaired, notifyDeviceIdentityChanged,
  storePendingPairing, readPendingPairing, clearPendingPairing
} from "./device-identity.ts";
import { decodePairingCode, joinWithCode, pollPairing } from "./pairing-client.ts";
import { SyncTransport } from "./sync-transport.ts";
import { syncNow } from "./sync-coordinator.ts";

export async function requestDeviceJoin(code: string, deviceName: string): Promise<string> {
  if (await readDeviceIdentity()) throw new Error("This browser already has pairing credentials.");
  const invitation = decodePairingCode(code);
  const device = await generateDeviceIdentity(deviceName);
  await storeDeviceIdentity({
    ...device, id: "current", spaceId: invitation.spaceId,
    status: "pending", enrollmentKind: "join"
  });
  await storePendingPairing({
    id: "pairing", invitationCode: code, confirmation: null, requestedAt: Date.now()
  });
  // On a lost HTTP response the stored key and invitation remain for a
  // signed status check; never generate a replacement key automatically.
  const joined = await joinWithCode(code, device);
  await storePendingPairing({
    id: "pairing", invitationCode: code, confirmation: joined.confirmation,
    requestedAt: Date.now()
  });
  return joined.confirmation;
}

export async function resumeDeviceJoin(): Promise<{
  phase: "waiting" | "connected";
  confirmation: string | null;
}> {
  const identity = await readDeviceIdentity();
  if (!identity || identity.status !== "pending" || identity.enrollmentKind !== "join") {
    throw new Error("No device is waiting for approval.");
  }
  const pending = await readPendingPairing();
  if (!pending) throw new Error("The invitation was not saved. Your device key is preserved.");
  const decoded = decodePairingCode(pending.invitationCode);
  if (decoded.spaceId !== identity.spaceId) throw new Error("Invitation belongs to another space.");
  const status = await pollPairing(pending.invitationCode);
  if (status.status !== "approved") {
    const confirmation = pending.confirmation ?? status.confirmation;
    if (confirmation && !pending.confirmation) await storePendingPairing({ ...pending, confirmation });
    return { phase: "waiting", confirmation };
  }
  // Server verifies actual possession of this device's P-256 signing key.
  await new SyncTransport(identity).control("GET", "devices");
  await markDevicePaired();
  await clearPendingPairing();
  notifyDeviceIdentityChanged();
  const paired = await readDeviceIdentity();
  if (!paired) throw new Error("Approved device identity could not be loaded.");
  await syncNow(paired);
  notifyDeviceIdentityChanged();
  return { phase: "connected", confirmation: null };
}
