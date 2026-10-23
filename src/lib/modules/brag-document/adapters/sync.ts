import type { SequencedSyncOperation } from '#lib/platform/data/sync-protocol.ts';
import {
  OUTBOX_STORE, SYNC_META_STORE, readOutbox, acknowledgeOutbox,
  initializeCaptureWithBaseline, activateCaptureFromRemote, resetCaptureAfterRestore
} from '#lib/platform/data/outbox.ts';
import {
  INBOX_STORE, TOMBSTONE_STORE, resetInboxAfterRestore, readInboxCursor,
  applyIncomingInTransaction, RemoteApplyConflict
} from '#lib/platform/data/inbox.ts';
import { decodeMoment } from '../core/moments.ts';
import { decodeOutput } from '../core/outputs.ts';
import { decodeFinalizedSnapshot } from '../core/snapshots.ts';
import { decodeCareerBackup, verifyCareerState, type CareerBackup } from '../core/backup.ts';
import {
  openCareerDatabase, notifyCareerChange, CAREER_MOMENTS_STORE as MOMENTS,
  CAREER_OUTPUTS_STORE as OUTPUTS, CAREER_SNAPSHOTS_STORE as SNAPSHOTS
} from './persistence.ts';
import type { CareerMoment, CareerOutput, FinalizedSnapshot } from '../core/types.ts';

const moduleId = 'brag-document' as const;
const localStores = [MOMENTS, OUTPUTS, SNAPSHOTS] as const;
const syncStores = [MOMENTS, OUTPUTS, SNAPSHOTS, OUTBOX_STORE, SYNC_META_STORE] as const;
const incomingStores = [...syncStores, INBOX_STORE, TOMBSTONE_STORE] as const;

function txFailure(tx: IDBTransaction, message: string, error?: Error | null) {
  return error ?? tx.error ?? new Error(message);
}
function transaction<T>(
  db: IDBDatabase, stores: readonly string[], mode: IDBTransactionMode,
  begin: (tx: IDBTransaction, complete: (value: T) => void,
    fail: (error: Error) => void) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...stores], mode);
    let answer: T;
    let completed = false;
    let reason: Error | null = null;
    const finish = (value: T) => { answer = value; completed = true; };
    const fail = (error: Error) => {
      reason = error;
      try { tx.abort(); } catch { reject(error); }
    };
    tx.oncomplete = () => completed
      ? resolve(answer)
      : reject(new Error('Career transaction produced no result.'));
    tx.onabort = () => reject(txFailure(tx, 'Career transaction aborted.', reason));
    tx.onerror = () => reject(txFailure(tx, 'Career transaction failed.', reason));
    try { begin(tx, finish, fail); }
    catch (error) { fail(error instanceof Error ? error : new Error('Career operation failed.')); }
  });
}

function allRecords(tx: IDBTransaction, done: (
  moments: CareerMoment[], outputs: CareerOutput[], snapshots: FinalizedSnapshot[]
) => void, fail: (cause: Error) => void) {
  const a = tx.objectStore(MOMENTS).getAll();
  const b = tx.objectStore(OUTPUTS).getAll();
  const c = tx.objectStore(SNAPSHOTS).getAll();
  let count = 0;
  const finish = () => {
    if (++count < 3) return;
    try {
      const state = verifyCareerState(
        (a.result as unknown[]).map(decodeMoment),
        (b.result as unknown[]).map(decodeOutput),
        (c.result as unknown[]).map(decodeFinalizedSnapshot)
      );
      done(state.moments, state.outputs, state.snapshots);
    } catch (err) {
      fail(err instanceof Error ? err : new Error('Career records are corrupt.'));
    }
  };
  a.onsuccess = finish;
  b.onsuccess = finish;
  c.onsuccess = finish;
}

export async function replaceCareerBackupForRestore(raw: unknown): Promise<void> {
  const backup = decodeCareerBackup(raw); // no destructive changes before validation
  const db = await openCareerDatabase();
  try {
    await transaction(db, incomingStores, 'readwrite', (tx, finish) => {
      for (const name of localStores) tx.objectStore(name).clear();
      for (const moment of backup.moments) tx.objectStore(MOMENTS).add(moment);
      for (const output of backup.outputs) tx.objectStore(OUTPUTS).add(output);
      for (const snapshot of backup.snapshots) tx.objectStore(SNAPSHOTS).add(snapshot);
      resetCaptureAfterRestore(tx);
      resetInboxAfterRestore(tx);
      finish(undefined);
    });
    notifyCareerChange();
  } finally { db.close(); }
}

export async function beginCareerSyncCapture(deviceId: string): Promise<void> {
  const db = await openCareerDatabase();
  try {
    await transaction(db, syncStores, 'readwrite', (tx, finish, fail) => {
      allRecords(tx, (moments, outputs, snapshots) => {
        initializeCaptureWithBaseline(tx, moduleId, deviceId,
          { ...verifyCareerState(moments, outputs, snapshots) });
        finish(undefined);
      }, fail);
    });
  } finally { db.close(); }
}

export async function beginCareerRemoteCapture(deviceId: string): Promise<void> {
  const db = await openCareerDatabase();
  try {
    await transaction(db, incomingStores, 'readwrite', (tx, finish) => {
      activateCaptureFromRemote(tx, deviceId, moduleId);
      finish(undefined);
    });
  } finally { db.close(); }
}

export async function readCareerRemoteCursor(): Promise<number> {
  const db = await openCareerDatabase();
  try { return await readInboxCursor(db); }
  finally { db.close(); }
}

export async function readCareerPendingSyncOperations(limit = 100) {
  const db = await openCareerDatabase();
  try { return await readOutbox(db, moduleId, limit); }
  finally { db.close(); }
}

export async function acknowledgeCareerSyncOperations(ids: readonly string[]): Promise<void> {
  const db = await openCareerDatabase();
  try { await acknowledgeOutbox(db, ids); }
  finally { db.close(); }
}

function sameRecords(a: unknown[], b: unknown[]): boolean {
  const sorted = (records: unknown[]) => JSON.stringify(
    [...records].sort((x, y) =>
      String((x as { id: string }).id).localeCompare(String((y as { id: string }).id)))
  );
  return sorted(a) === sorted(b);
}

function applyCareerOperation(
  tx: IDBTransaction, event: SequencedSyncOperation,
  next: () => void, fail: (error: Error) => void
): void {
  const body = event.payload;
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new RemoteApplyConflict('Invalid Career Evidence sync payload.');
  const data = body as Record<string, unknown>;
  if (event.kind === 'baseline' && event.entityId === 'module') {
    const baseline = decodeCareerBackup(body);
    allRecords(tx, (moments, outputs, snapshots) => {
      const empty = moments.length === 0 && outputs.length === 0 && snapshots.length === 0;
      if (!empty && (!sameRecords(moments, baseline.moments) ||
          !sameRecords(outputs, baseline.outputs) ||
          !sameRecords(snapshots, baseline.snapshots))) {
        fail(new RemoteApplyConflict('Career Evidence baseline conflicts with local history.'));
        return;
      }
      if (empty) {
        for (const item of baseline.moments) tx.objectStore(MOMENTS).add(item);
        for (const item of baseline.outputs) tx.objectStore(OUTPUTS).add(item);
        for (const item of baseline.snapshots) tx.objectStore(SNAPSHOTS).add(item);
      }
      next();
    }, fail);
    return;
  }
  if (event.kind !== 'upsert') {
    throw new RemoteApplyConflict('Unsupported Career Evidence sync operation.');
  }
  if (event.entityId.startsWith('moment:')) {
    const row = decodeMoment(data.moment);
    if (event.entityId !== 'moment:' + row.id) throw new RemoteApplyConflict('Moment sync ID mismatch.');
    const store = tx.objectStore(MOMENTS);
    const req = store.get(row.id);
    req.onsuccess = () => {
      const old = req.result ? decodeMoment(req.result) : null;
      if ((old ? String(old.revision) : null) !== event.baseRevision ||
          (old && row.revision !== old.revision + 1) || (!old && row.revision !== 1)) {
        fail(new RemoteApplyConflict('Conflicting remote career moment revision.')); return;
      }
      store.put(row);
      next();
    };
    return;
  }
  if (event.entityId.startsWith('output:')) {
    const row = decodeOutput(data.output);
    if (event.entityId !== 'output:' + row.id) throw new RemoteApplyConflict('Output sync ID mismatch.');
    const store = tx.objectStore(OUTPUTS);
    const req = store.get(row.id);
    req.onsuccess = () => {
      const old = req.result ? decodeOutput(req.result) : null;
      if ((old ? String(old.revision) : null) !== event.baseRevision ||
          (old && row.revision !== old.revision + 1) || (!old && row.revision !== 1)) {
        fail(new RemoteApplyConflict('Conflicting remote career output revision.')); return;
      }
      const sourceReq = tx.objectStore(MOMENTS).getAll();
      sourceReq.onsuccess = () => {
        const sources = new Map((sourceReq.result as unknown[]).map(value => {
          const m = decodeMoment(value);
          return [m.id, m] as const;
        }));
        if (row.items.some(item =>
          !sources.has(item.momentId) || sources.get(item.momentId)!.revision < item.sourceRevision)) {
          fail(new RemoteApplyConflict('Document references missing career source.')); return;
        }
        store.put(row);
        next();
      };
    };
    return;
  }
  if (event.entityId.startsWith('snapshot:') && event.baseRevision === null) {
    const row = decodeFinalizedSnapshot(data.snapshot);
    if (event.entityId !== 'snapshot:' + row.id) throw new RemoteApplyConflict('Snapshot sync ID mismatch.');
    const snapshots = tx.objectStore(SNAPSHOTS);
    const req = snapshots.index('outputId').getAll(row.outputId);
    req.onsuccess = () => {
      if (req.result.some((value: unknown) => {
        const other = decodeFinalizedSnapshot(value);
        return other.id === row.id || other.version === row.version;
      })) {
        fail(new RemoteApplyConflict('Finalized document version collision.')); return;
      }
      const outputReq = tx.objectStore(OUTPUTS).get(row.outputId);
      outputReq.onsuccess = () => {
        if (!outputReq.result) {
          fail(new RemoteApplyConflict('Finalized document references missing output.')); return;
        }
        const sources = tx.objectStore(MOMENTS).getAllKeys();
        sources.onsuccess = () => {
          const ids = new Set(sources.result.map(String));
          if (row.sections.some(section => !ids.has(section.momentId))) {
            fail(new RemoteApplyConflict('Finalized document references missing source.')); return;
          }
          snapshots.add(row);
          next();
        };
      };
    };
    return;
  }
  throw new RemoteApplyConflict('Unsupported career entity or base revision.');
}

export async function applyCareerRemoteChanges(
  events: readonly SequencedSyncOperation[]
): Promise<void> {
  if (events.length === 0) return;
  const db = await openCareerDatabase();
  try {
    await transaction(db, incomingStores, 'readwrite', (tx, finish, fail) => {
      applyIncomingInTransaction(
        tx, moduleId, events,
        (event, next, stop) => {
          try { applyCareerOperation(tx, event, next, stop); }
          catch (cause) {
            stop(cause instanceof Error ? cause : new RemoteApplyConflict('Invalid remote career operation.'));
          }
        },
        () => finish(undefined), fail
      );
    });
    notifyCareerChange();
  } finally { db.close(); }
}
