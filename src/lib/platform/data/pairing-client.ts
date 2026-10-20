import { SyncTransport } from "./sync-transport.ts";
import { generateDeviceIdentity, type NewDeviceIdentity, type StoredDeviceIdentity } from "./device-identity.ts";

const PAIRING_FORMAT = /^[0-9a-f-]{36}\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/;
function path(spaceId: string, suffix: string): string {
  return "/api/sync/spaces/" + encodeURIComponent(spaceId) + "/" + suffix;
}
async function invoke<T>(route: string, payload: unknown): Promise<T> {
  const response = await fetch(route, { method: "POST", cache: "no-store", credentials: "omit",
    headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error("Pairing request failed (" + response.status + ").");
  return await response.json() as T;
}
function identityBody(identity: NewDeviceIdentity) {
  return { deviceId: identity.deviceId, name: identity.name, publicKey: identity.publicKey };
}
export function encodePairingCode(spaceId: string, invitationId: string, secret: string): string {
  const code = [spaceId, invitationId, secret].join(".");
  if (!PAIRING_FORMAT.test(code)) throw new Error("Invalid pairing invitation.");
  return code;
}
export function decodePairingCode(code: string) {
  const trimmed = code.trim();
  if (!PAIRING_FORMAT.test(trimmed)) throw new Error("Invalid pairing code.");
  const [spaceId, invitationId, secret] = trimmed.split(".");
  return { spaceId, invitationId, secret };
}
/** Invitation secrets remain in the URL fragment, never in a request path/query. */
export function createPairingLink(origin: string, code: string): string {
  decodePairingCode(code);
  const url = new URL("/settings/data", origin);
  url.hash = "pair=" + encodeURIComponent(code);
  return url.href;
}
/** Safe to use after reading location.hash; caller immediately replaces the URL. */
export function readPairingFragment(fragment: string): string | null {
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  const code = params.get("pair");
  if (!code) return null;
  decodePairingCode(code);
  return code;
}

export async function initializeSpace(device: NewDeviceIdentity) {
  return invoke<{ spaceId: string; recoveryKey: string }>(
    "/api/sync/initialize", identityBody(device)
  );
}
export async function joinWithCode(code: string, device: NewDeviceIdentity) {
  const item = decodePairingCode(code);
  const result = await invoke<{ status: "pending"; confirmation: string }>(
    path(item.spaceId, "pairings/" + item.invitationId + "/join"),
    { secret: item.secret, identity: identityBody(device) }
  );
  return { ...result, ...item };
}
export async function pollPairing(code: string) {
  const item = decodePairingCode(code);
  return invoke<{ status: "awaiting-device" | "pending-approval" | "approved"; confirmation: string | null }>(
    path(item.spaceId, "pairings/" + item.invitationId + "/status"), { secret: item.secret }
  );
}
export function encodeRecoveryCode(spaceId: string, secret: string): string {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(spaceId) ||
      !/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error("Invalid recovery credentials.");
  return spaceId + "." + secret;
}
export function decodeRecoveryCode(code: string): { spaceId: string; recoveryKey: string } {
  const value = code.trim();
  const separator = value.indexOf(".");
  if (separator < 0) throw new Error("Recovery code must contain the space ID and key.");
  const spaceId = value.slice(0, separator);
  const recoveryKey = value.slice(separator + 1);
  encodeRecoveryCode(spaceId, recoveryKey);
  return { spaceId, recoveryKey };
}
export async function recoverSpace(spaceId: string, recoveryKey: string, device: NewDeviceIdentity) {
  return invoke<{ recovered: true; recoveryKey: string }>(
    path(spaceId, "recover"), { recoveryKey, identity: identityBody(device) }
  );
}
export function pairedTransport(identity: StoredDeviceIdentity): SyncTransport {
  if (identity.status !== "paired") throw new Error("This device has not been approved.");
  return new SyncTransport(identity);
}
export async function createPairingInvite(identity: StoredDeviceIdentity) {
  return pairedTransport(identity).control<{ invitationId: string; secret: string; expiresAt: number }>(
    "POST", "pairings", {}
  );
}
export async function inspectPairingInvite(identity: StoredDeviceIdentity, id: string) {
  return pairedTransport(identity).control<{
    status: string; candidateName: string | null; confirmation: string | null; expiresAt: number
  }>("GET", "pairings/" + id);
}
export async function approvePairingInvite(identity: StoredDeviceIdentity, id: string, confirmation: string) {
  return pairedTransport(identity).control<{ approved: true }>(
    "POST", "pairings/" + id + "/approve", { confirmation }
  );
}
export async function listPairedDevices(identity: StoredDeviceIdentity) {
  return pairedTransport(identity).control<{ devices: Array<{
    deviceId: string; name: string; addedAt: number; revoked: boolean
  }> }>("GET", "devices");
}
export async function revokePairedDevice(identity: StoredDeviceIdentity, victim: string) {
  return pairedTransport(identity).control<{ revoked: true }>("DELETE", "devices/" + victim);
}
