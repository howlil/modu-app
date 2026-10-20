import { globalDataPorts } from "./registry.ts";
import type { ModuleDataPort } from "./contracts.ts";
import { generateDeviceIdentity, markDevicePaired, notifyDeviceIdentityChanged,
  readDeviceIdentity, storeDeviceIdentity, type StoredDeviceIdentity } from "./device-identity.ts";
import { initializeSpace } from "./pairing-client.ts";
import { syncNow, type SyncProgress } from "./sync-coordinator.ts";

/** Conservative bound: M4 signed HTTP requests are capped at 256 KiB. */
const SAFE_BASELINE_BYTES = 185_000;
export type SetupStage = "checking" | "creating" | "capturing" | "uploading" | "connected";

function sizeInBytes(input: unknown): number {
  const encoded = JSON.stringify(input);
  if (encoded === undefined) throw new Error("Module baseline is not serializable.");
  return new TextEncoder().encode(encoded).length;
}

export async function preflightSyncBaseline(
  ports: readonly ModuleDataPort[] = globalDataPorts
): Promise<void> {
  for (const port of ports) {
    await port.inspect();
    const size = sizeInBytes(await port.exportBackup());
    if (size > SAFE_BASELINE_BYTES) {
      throw new Error(port.moduleId + " has more data than initial sync currently supports. Download a global backup. No cloud space was created.");
    }
  }
}

export async function resumeOwnerSetup(
  identity: StoredDeviceIdentity, stage: (stage: SetupStage) => void
): Promise<SyncProgress> {
  if (identity.enrollmentKind !== "owner") throw new Error("This device is not the original sync owner.");
  if (identity.status === "pending") {
    if (!navigator.locks?.request) throw new Error("Safe setup requires Web Locks.");
    stage("capturing");
    await navigator.locks.request("modu-global-restore", { mode: "exclusive" }, async () => {
      for (const port of globalDataPorts) await port.beginSyncCapture(identity.deviceId);
      await markDevicePaired();
    });
  }
  const current = await readDeviceIdentity();
  if (!current || current.deviceId !== identity.deviceId || current.status !== "paired") {
    throw new Error("Device identity changed during setup.");
  }
  stage("uploading");
  const result = await syncNow(current);
  stage("connected");
  notifyDeviceIdentityChanged();
  return result;
}
export async function enableSyncOnce(
  deviceName: string, stage: (stage: SetupStage) => void,
  onRecoveryCode: (code: string) => void = () => {}
): Promise<{ recoveryCode: string; progress: SyncProgress }> {
  if (await readDeviceIdentity()) throw new Error("This browser already has a sync identity.");
  stage("checking");
  await preflightSyncBaseline();
  stage("creating");
  const device = await generateDeviceIdentity(deviceName);
  // Do not silently retry this request if its response is lost: the server
  // may have committed the space before the connection failed.
  const created = await initializeSpace(device);
  await storeDeviceIdentity({
    ...device, id: "current", spaceId: created.spaceId, status: "pending",
    enrollmentKind: "owner"
  });
  onRecoveryCode(created.spaceId + "." + created.recoveryKey);
  const identity = await readDeviceIdentity();
  if (!identity) throw new Error("Device identity was not persisted.");
  const progress = await resumeOwnerSetup(identity, stage);
  return { recoveryCode: created.spaceId + "." + created.recoveryKey, progress };
}
