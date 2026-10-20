import type { DataInspection, GlobalBackupV1, GlobalModuleBackup, ModuleDataPort, ModuleDataId } from "./contracts.ts";

/** Bound JSON serialization to reduce the chance of browser OOM with huge histories. */
const MAX_BACKUP_BYTES = 300 * 1024 * 1024;

export async function inspectGlobalData(ports: readonly ModuleDataPort[]): Promise<DataInspection[]> {
  const results: DataInspection[] = [];
  for (const port of ports) {
    results.push(await port.inspect());
  }
  return results;
}

/** Fail closed: do not produce a success artifact if ANY registered module cannot be read. */
export async function createGlobalBackup(
  ports: readonly ModuleDataPort[],
  exportedAt = new Date().toISOString()
): Promise<GlobalBackupV1> {
  if (!Number.isFinite(Date.parse(exportedAt))) throw new Error("Invalid backup timestamp.");
  if (ports.length === 0) throw new Error("No modules registered for backup.");
  const modules: Partial<Record<ModuleDataId, GlobalModuleBackup>> = {};
  for (const port of ports) {
    if (Object.hasOwn(modules, port.moduleId)) throw new Error("Duplicate data module: " + port.moduleId);
    if (!Number.isSafeInteger(port.backupVersion) || port.backupVersion < 1) {
      throw new Error("Invalid backup version for " + port.moduleId);
    }
    const data = await port.exportBackup();
    if (data === undefined) throw new Error("Module returned no backup: " + port.moduleId);
    modules[port.moduleId] = { backupVersion: port.backupVersion, data };
  }
  return { format: "modu-global-backup", version: 1, exportedAt, modules };
}

export function encodeGlobalBackup(backup: GlobalBackupV1): string {
  const json = JSON.stringify(backup);
  if (!json || new Blob([json]).size > MAX_BACKUP_BYTES) {
    throw new Error("Global backup is too large for browser export.");
  }
  return json;
}
