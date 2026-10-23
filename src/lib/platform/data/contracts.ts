/** Public, feature-owned data-management ports. Never expose raw IDB handles here. */
export const MODULE_DATA_IDS = ["pomodoro", "habit-tracker", "language-learning", "brag-document"] as const;
export type ModuleDataId = (typeof MODULE_DATA_IDS)[number];

export type DataInspection = {
  moduleId: ModuleDataId;
  backupVersion: number;
  recordCount: number;
  state: "ready" | "empty";
};

/** Backups are opaque to the global layer; the owning module validates them. */
export interface ModuleDataPort {
  readonly moduleId: ModuleDataId;
  readonly backupVersion: number;
  inspect(): Promise<DataInspection>;
  exportBackup(): Promise<unknown>;
}

export type GlobalModuleBackup = {
  backupVersion: number;
  data: unknown;
};

export type GlobalBackupV1 = {
  format: "modu-global-backup";
  version: 1;
  exportedAt: string;
  modules: Partial<Record<ModuleDataId, GlobalModuleBackup>>;
};

/** Restore is optional at the adapter boundary and must validate before mutation. */
export type RestorePreview = {
  moduleId: ModuleDataId;
  recordCount: number;
  warnings: string[];
};

export interface RestorableDataPort extends ModuleDataPort {
  /** Opt-in only for a newly introduced module; older global backups omit it. */
  emptyBackupForLegacyRestore?(): unknown;
  validateBackup(data: unknown): Promise<RestorePreview>;
  restoreBackup(data: unknown): Promise<void>;
}

/** Feature-owned M3 transport port. No network operation belongs in a module. */
export interface SyncOutboxPort extends RestorableDataPort {
  beginSyncCapture(deviceId: string): Promise<void>;
  /** Optional for modules introduced after a browser has already paired. */
  resumeSyncCapture?(deviceId: string): Promise<void>;
  beginRemoteSyncCapture(deviceId: string): Promise<void>;
  readRemoteCursor(): Promise<number>;
  applyRemoteChanges(events: readonly import("./sync-protocol.ts").SequencedSyncOperation[]): Promise<void>;
  readPendingSyncOperations(limit?: number): Promise<import("./outbox.ts").PendingSyncOperation[]>;
  acknowledgeSyncOperations(operationIds: readonly string[]): Promise<void>;
}
