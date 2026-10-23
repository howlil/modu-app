import type { SyncOutboxPort } from '#lib/platform/data/contracts.ts';
import { decodeCareerBackup } from '../core/backup.ts';
import { exportMomentsBackup } from './persistence.ts';
import {
  acknowledgeCareerSyncOperations, applyCareerRemoteChanges,
  beginCareerRemoteCapture, beginCareerSyncCapture,
  readCareerPendingSyncOperations, readCareerRemoteCursor,
  replaceCareerBackupForRestore
} from './sync.ts';

const snapshot = async () => decodeCareerBackup(JSON.parse(await exportMomentsBackup()) as unknown);

export const careerDataPort: SyncOutboxPort = {
  moduleId: 'brag-document',
  backupVersion: 3,
  async inspect() {
    const state = await snapshot();
    const recordCount = state.moments.length + state.outputs.length + state.snapshots.length;
    return {
      moduleId: 'brag-document', backupVersion: 3,
      recordCount, state: recordCount ? 'ready' : 'empty'
    };
  },
  exportBackup: snapshot,
  async validateBackup(data: unknown) {
    const state = decodeCareerBackup(data);
    return {
      moduleId: 'brag-document',
      recordCount: state.moments.length + state.outputs.length + state.snapshots.length,
      warnings: []
    };
  },
  restoreBackup: replaceCareerBackupForRestore,
  beginSyncCapture: beginCareerSyncCapture,
  beginRemoteSyncCapture: beginCareerRemoteCapture,
  readRemoteCursor: readCareerRemoteCursor,
  applyRemoteChanges: applyCareerRemoteChanges,
  readPendingSyncOperations: readCareerPendingSyncOperations,
  acknowledgeSyncOperations: acknowledgeCareerSyncOperations
};
