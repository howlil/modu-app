import type {
  GlobalBackupV1, ModuleDataId, RestorableDataPort, RestorePreview
} from "./contracts.ts";
import { createGlobalBackup } from "./backup.ts";
import { requireNoOtherModuTabs } from "./peer-tabs.ts";
import {
  readRestoreJournal, createRestoreJournal, deleteRestoreJournal
} from "./recovery-journal.ts";

const MAX_IMPORT_SIZE = 300 * 1024 * 1024;
export const RESTORE_PENDING_KEY = "modu:global-restore-pending";

function clearRestoreMarker(): void {
  try { localStorage.removeItem(RESTORE_PENDING_KEY); } catch { /* browser may deny storage */ }
}

export type PreparedGlobalRestore = {
  backup: GlobalBackupV1;
  preview: RestorePreview[];
};

function decodedEnvelope(raw: unknown, ports: readonly RestorableDataPort[]): GlobalBackupV1 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Backup must be a JSON object.");
  const backup = raw as Partial<GlobalBackupV1>;
  if (backup.format !== "modu-global-backup" || backup.version !== 1 ||
      !backup.modules || typeof backup.modules !== "object" || Array.isArray(backup.modules) ||
      typeof backup.exportedAt !== "string" || !Number.isFinite(Date.parse(backup.exportedAt))) {
    throw new Error("Unsupported Modu global backup.");
  }
  const modules = backup.modules as Record<string, unknown>;
  const names = Object.keys(modules);
  if (names.length !== ports.length || new Set(ports.map(p => p.moduleId)).size !== ports.length) {
    throw new Error("Backup module set does not match installed modules.");
  }
  for (const key of names) {
    if (!ports.some(port => port.moduleId === key)) {
      throw new Error("Backup contains an unrecognized module: " + key);
    }
  }
  for (const port of ports) {
    const entry = modules[port.moduleId];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Backup is missing " + port.moduleId);
    }
    const payload = entry as Record<string, unknown>;
    if (payload.backupVersion !== port.backupVersion || !("data" in payload)) {
      throw new Error("Incompatible backup version for " + port.moduleId);
    }
  }
  return backup as GlobalBackupV1;
}

export async function prepareGlobalRestore(
  json: string, ports: readonly RestorableDataPort[]
): Promise<PreparedGlobalRestore> {
  if (new Blob([json]).size > MAX_IMPORT_SIZE) throw new Error("Global backup exceeds 300 MiB.");
  let parsed: unknown;
  try { parsed = JSON.parse(json); }
  catch { throw new Error("Backup file contains invalid JSON."); }
  const backup = decodedEnvelope(parsed, ports);
  const preview: RestorePreview[] = [];
  for (const port of ports) {
    preview.push(await port.validateBackup(backup.modules[port.moduleId]!.data));
  }
  return { backup, preview };
}

async function restoreEach(
  backup: GlobalBackupV1, ports: readonly RestorableDataPort[]
): Promise<void> {
  for (const port of ports) {
    const entry = backup.modules[port.moduleId];
    if (!entry) throw new Error("Missing recovery payload for " + port.moduleId);
    await port.restoreBackup(entry.data);
  }
}

/**
 * A cross-IDB restore is not atomic. Write an entire validated checkpoint before
 * the first domain commit, then rollback on error and recover after interruption.
 * Caller must ensure no other tabs are mutating domain data during restoration.
 */
export async function commitGlobalRestore(
  prepared: PreparedGlobalRestore,
  ports: readonly RestorableDataPort[]
): Promise<void> {
  if (!navigator.locks?.request) throw new Error("Safe restore requires browser Web Locks support.");
  await requireNoOtherModuTabs();
  return navigator.locks.request("modu-global-restore", { mode: "exclusive" }, async () => {
  // Validate the target again against the current set of modules.
  const target = await prepareGlobalRestore(JSON.stringify(prepared.backup), ports);
  if (target.preview.length !== ports.length) throw new Error("Incomplete restore validation.");
  if (await readRestoreJournal()) throw new Error("Previous restore needs recovery first.");
  const checkpoint = await createGlobalBackup(ports);
  const recovery = await prepareGlobalRestore(JSON.stringify(checkpoint), ports);
  // Set the marker before the journal. A crash at either step cannot leave a
  // partially committed restore hidden from the next startup recovery check.
  try {
    localStorage.setItem(RESTORE_PENDING_KEY, "1");
  } catch (cause) {
    throw new Error("Cannot record restore recovery marker. No module data was changed.", { cause });
  }
  try {
    await createRestoreJournal({ id: "active", createdAt: Date.now(), checkpoint: recovery.backup });
  } catch (cause) {
    clearRestoreMarker();
    throw cause;
  }

  try {
    await restoreEach(target.backup, ports);
    await deleteRestoreJournal();
    clearRestoreMarker();
  } catch (cause) {
    try {
      await restoreEach(recovery.backup, ports);
      await deleteRestoreJournal();
      clearRestoreMarker();
    } catch {
      throw new Error("Restore interrupted and automatic rollback failed. Recovery checkpoint retained.");
    }
    throw cause;
  }
  });
}

/** Run before the app hydrates, so no controller can write a half-restored state. */
export async function recoverInterruptedRestore(ports: readonly RestorableDataPort[]): Promise<boolean> {
  if (!navigator.locks?.request) {
    throw new Error("Interrupted restore needs Web Locks support for safe recovery.");
  }
  return navigator.locks.request("modu-global-restore", { mode: "exclusive" }, async () => {
    const journal = await readRestoreJournal();
    if (!journal) { clearRestoreMarker(); return false; }
    const backup = await prepareGlobalRestore(JSON.stringify(journal.checkpoint), ports);
    await restoreEach(backup.backup, ports);
    await deleteRestoreJournal();
    clearRestoreMarker();
    return true;
  });
}
