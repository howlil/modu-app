import type { GoalPolicy, HabitCheckin, HabitDefinition, LocalDate } from '../core/types.ts';
import {
  OUTBOX_STORE, SYNC_META_STORE, ensureOutboxStores, queueLocalMutation,
  resetCaptureAfterRestore, readOutbox, acknowledgeOutbox, initializeCaptureWithBaseline, activateCaptureFromRemote
} from '#lib/platform/data/outbox.ts';
import {
  INBOX_STORE, TOMBSTONE_STORE, ensureInboxStores,
  resetInboxAfterRestore, readInboxCursor, applyIncomingInTransaction, RemoteApplyConflict
} from '#lib/platform/data/inbox.ts';
import type { SequencedSyncOperation } from '#lib/platform/data/sync-protocol.ts';
import { isLocalDate, resolveEffectivePolicy } from '../core/scheduling.ts';
import {
  archiveHabit, booleanCheckin, makeDailyBooleanHabit, renameHabit, restoreHabit
} from '../core/management.ts';
import { validateCheckin, validateGoalPolicy, validateHabit } from '../core/validation.ts';
import { browserLocalDate, browserTimezone, isSupportedTimezone } from './browser-date.ts';
import { applyCheckinCommand, makeConfiguredDailyHabit, type CheckinCommand, type HabitSetup } from '../core/progress.ts';
import { createPolicyRevision, type PolicyRevisionInput } from '../core/policy.ts';

const DATABASE = 'modu-habit-tracker';
const VERSION = 4;
const CHANGE = 'modu:habit-changed';
const CHANNEL = 'modu-habit-tracker-changes';
type StoreName = 'habits' | 'policies' | 'checkins' | 'preferences' | typeof OUTBOX_STORE | typeof SYNC_META_STORE | typeof INBOX_STORE | typeof TOMBSTONE_STORE;

export interface HabitSnapshot {
  habits: HabitDefinition[];
  policies: GoalPolicy[];
  checkins: HabitCheckin[];
  trackingTimezone?: string;
}

export class HabitStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HabitStorageError';
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new HabitStorageError('IndexedDB is unavailable in this browser.')); return;
    }
    const request = indexedDB.open(DATABASE, VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('habits')) db.createObjectStore('habits', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('policies')) {
        const policies = db.createObjectStore('policies', { keyPath: 'id' });
        policies.createIndex('habitId', 'habitId', { unique: false });
      }
      if (!db.objectStoreNames.contains('checkins')) {
        const checkins = db.createObjectStore('checkins', { keyPath: 'id' });
        checkins.createIndex('habitId', 'habitId', { unique: false });
      }
      if (!db.objectStoreNames.contains('preferences')) {
        db.createObjectStore('preferences', { keyPath: 'id' });
      }
      ensureOutboxStores(db);
      ensureInboxStores(db);
    };
    request.onsuccess = () => {
      // An upgrade can eventually proceed after onblocked already rejected.
      // Close that late connection instead of leaking it into another tab.
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(new HabitStorageError('Unable to open the Habit Tracker database.'));
    request.onblocked = () => {
      blocked = true;
      reject(new HabitStorageError('Close other tabs that are blocking database access, then retry.'));
    };
  });
}

async function withDatabase<T>(work: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDatabase();
  try { return await work(db); }
  finally { db.close(); }
}

/** Resolves only at transaction completion, never at an individual request's success. */
function transaction<T>(
  db: IDBDatabase,
  names: StoreName[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction, set: (result: T) => void, fail: (error: Error) => void) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode);
    let result!: T;
    let failure: Error | null = null;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure ?? tx.error ?? new HabitStorageError('Habit transaction aborted.'));
    tx.onerror = () => { /* onabort reports the outcome */ };
    const fail = (error: Error) => {
      failure = error;
      try { tx.abort(); } catch { reject(error); }
    };
    try { work(tx, value => { result = value; }, fail); }
    catch (error) { fail(error instanceof Error ? error : new HabitStorageError('Unexpected storage error.')); }
  });
}

function enforceValid(result: ReturnType<typeof validateHabit>): void {
  if (!result.ok) throw new HabitStorageError('Stored habit data is invalid: ' + result.issues.join(' '));
}

/** Validate the complete loaded snapshot before any record reaches reactive UI. */
export function validateHabitSnapshot(snapshot: HabitSnapshot): HabitSnapshot {
  if (snapshot.trackingTimezone !== undefined &&
    !isSupportedTimezone(snapshot.trackingTimezone)) {
    throw new HabitStorageError('Invalid stored tracking timezone; no data has been changed.');
  }
  const byId = new Map<string, HabitDefinition>();
  for (const habit of snapshot.habits) {
    enforceValid(validateHabit(habit));
    if (byId.has(habit.id)) throw new HabitStorageError('Duplicate stored habit ID.');
    byId.set(habit.id, habit);
  }
  const seenPolicies = new Set<string>();
  for (const policy of snapshot.policies) {
    const owner = byId.get(policy.habitId);
    if (!owner) throw new HabitStorageError('Orphaned habit policy; no data has been changed.');
    enforceValid(validateGoalPolicy(policy, owner.direction));
    const key = policy.habitId + ':' + policy.effectiveFromDate;
    if (seenPolicies.has(key)) throw new HabitStorageError('Conflicting habit policy versions.');
    seenPolicies.add(key);
  }
  // Prevent a valid-looking habit without any applicable policy from throwing
  // in the Today derived view after storageReady was set true.
  for (const habit of snapshot.habits) {
    try {
      resolveEffectivePolicy(habit.id, habit.createdDate, snapshot.policies);
    } catch {
      throw new HabitStorageError('Habit ' + habit.id + ' is missing its initial policy; no data has been changed.');
    }
  }
  for (const checkin of snapshot.checkins) {
    if (!byId.has(checkin.habitId) || !isLocalDate(checkin.localDate)) {
      throw new HabitStorageError('Invalid saved check-in; no data has been changed.');
    }
    const policy = resolveEffectivePolicy(checkin.habitId, checkin.localDate, snapshot.policies);
    enforceValid(validateCheckin(checkin, policy));
  }
  return snapshot;
}

function broadcastChange(): void {
  // Notifications are best effort; an unavailable channel must never make an
  // already-committed IndexedDB write appear to have failed.
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new Event(CHANGE)); } catch { /* committed write is authoritative */ }
  if (typeof BroadcastChannel !== 'undefined') {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.postMessage('changed');
    } catch { /* other tabs can refresh on focus */ }
    finally {
      try { channel?.close(); } catch { /* best effort */ }
    }
  }
}

export function subscribeHabitChanges(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(CHANNEL);
  } catch { /* listening to same-tab changes and focus refresh still works */ }
  window.addEventListener(CHANGE, onChange);
  if (channel) channel.onmessage = () => onChange();
  return () => {
    window.removeEventListener(CHANGE, onChange);
    channel?.close();
  };
}

/**
 * A version-1 database is upgraded non-destructively to version 2.
 * The user's initial tracking timezone is pinned once in preferences, while
 * existing habits, policies and check-ins remain completely unchanged.
 */
export async function loadHabitSnapshot(): Promise<HabitSnapshot> {
  const snapshot = await withDatabase(db => transaction<HabitSnapshot>(
    db, ['habits', 'policies', 'checkins', 'preferences'], 'readwrite', (tx, set, fail) => {
      const result: HabitSnapshot = { habits: [], policies: [], checkins: [] };
      set(result);
      tx.objectStore('habits').getAll().onsuccess = e => {
        result.habits = (e.target as IDBRequest).result as HabitDefinition[];
      };
      tx.objectStore('policies').getAll().onsuccess = e => {
        result.policies = (e.target as IDBRequest).result as GoalPolicy[];
      };
      tx.objectStore('checkins').getAll().onsuccess = e => {
        result.checkins = (e.target as IDBRequest).result as HabitCheckin[];
      };
      const preferences = tx.objectStore('preferences');
      const timezoneRequest = preferences.get('tracking');
      timezoneRequest.onsuccess = () => {
        const saved = timezoneRequest.result as { id: string; trackingTimezone?: string } | undefined;
        const timezone = saved ? saved.trackingTimezone : browserTimezone();
        if (!timezone || !isSupportedTimezone(timezone)) {
          fail(new HabitStorageError('Stored tracking timezone is invalid.')); return;
        }
        result.trackingTimezone = timezone;
        if (!saved) preferences.add({ id: 'tracking', trackingTimezone: timezone });
      };
    }
  ));
  return validateHabitSnapshot(snapshot);
}

/** Calendar boundary for all writes must match the persisted tracking timezone. */
async function currentTrackingDate(): Promise<LocalDate> {
  const timezone = await withDatabase(db => transaction<string>(
    db, ['preferences'], 'readonly', (tx, set, fail) => {
      const request = tx.objectStore('preferences').get('tracking');
      request.onsuccess = () => {
        const value = request.result?.trackingTimezone as string | undefined;
        if (!value || !isSupportedTimezone(value)) {
          fail(new HabitStorageError('Open Habit Tracker to initialize its tracking timezone.')); return;
        }
        set(value);
      };
    }
  ));
  return browserLocalDate(new Date(), timezone);
}

/** M1 entrypoint retained for existing callers. */
export async function createDailyHabit(title: string, date: LocalDate): Promise<void> {
  await createConfiguredHabit({ title, direction: 'BUILD', measurement: 'BOOLEAN' }, date);
}

export async function createConfiguredHabit(input: HabitSetup, date: LocalDate): Promise<void> {
  if (!isLocalDate(date) || date !== await currentTrackingDate()) {
    throw new RangeError('New habits must begin on the current local day.');
  }
  const id = crypto.randomUUID();
  const { habit, policy } = makeConfiguredDailyHabit(id, input, date);
  await withDatabase(db => transaction<void>(
    db, ['habits', 'policies', OUTBOX_STORE, SYNC_META_STORE], 'readwrite', tx => {
      tx.objectStore('habits').add(habit);
      tx.objectStore('policies').add(policy);
      queueLocalMutation(tx, 'habit-tracker', id, 'upsert', { habit, policy });
    }
  ));
  broadcastChange();
}

export async function changeHabitTitle(id: string, title: string): Promise<void> {
  await withDatabase(db => transaction<void>(
    db, ['habits', OUTBOX_STORE, SYNC_META_STORE], 'readwrite', (tx, _set, fail) => {
      const store = tx.objectStore('habits');
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) { fail(new HabitStorageError('Habit not found.')); return; }
        try {
          const previous = request.result as HabitDefinition;
          const updated = renameHabit(previous, title);
          store.put(updated);
          queueLocalMutation(tx, 'habit-tracker', id, 'upsert', { habit: updated, before: previous });
        }
        catch (error) { fail(error as Error); }
      };
    }
  ));
  broadcastChange();
}

/**
 * Rename and append one immutable future policy revision atomically.
 * Read the authoritative habit/policies inside this same readwrite transaction.
 */
export async function updateHabitConfiguration(
  id: string,
  title: string,
  policyInput: PolicyRevisionInput,
  today: LocalDate,
  revisePolicy: boolean
): Promise<void> {
  if (!isLocalDate(today) || today !== await currentTrackingDate()) {
    throw new RangeError('The local date changed. Reopen the editor before saving.');
  }
  await withDatabase(db => transaction<void>(
    db, ['habits', 'policies', OUTBOX_STORE, SYNC_META_STORE], 'readwrite', (tx, _set, fail) => {
      const habitStore = tx.objectStore('habits');
      const policyStore = tx.objectStore('policies');
      const getHabit = habitStore.get(id);
      getHabit.onsuccess = () => {
        if (!getHabit.result) { fail(new HabitStorageError('Habit not found.')); return; }
        const getPolicies = policyStore.index('habitId').getAll(id);
        getPolicies.onsuccess = () => {
          try {
            const habit = getHabit.result as HabitDefinition;
            const renamed = renameHabit(habit, title);
            const revision = revisePolicy ? createPolicyRevision(
              habit, getPolicies.result as GoalPolicy[], policyInput, today, crypto.randomUUID()
            ) : null;
            if (renamed.title !== habit.title) habitStore.put(renamed);
            if (revision) policyStore.add(revision);
            if (renamed.title !== habit.title || revision) {
              queueLocalMutation(tx, 'habit-tracker', id, 'upsert', { habit: renamed, policy: revision, before: habit });
            }
          } catch (error) { fail(error as Error); }
        };
      };
    }
  ));
  broadcastChange();
}

export async function setHabitArchived(id: string, archive: boolean, date: LocalDate): Promise<void> {
  if (!isLocalDate(date) || date !== await currentTrackingDate()) {
    throw new RangeError('The tracking date has changed. Refresh before changing archive status.');
  }
  await withDatabase(db => transaction<void>(
    db, ['habits', OUTBOX_STORE, SYNC_META_STORE], 'readwrite', (tx, _set, fail) => {
      const store = tx.objectStore('habits');
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) { fail(new HabitStorageError('Habit not found.')); return; }
        try {
          const previous = request.result as HabitDefinition;
          const updated = archive ? archiveHabit(previous, date) : restoreHabit(previous, date);
          store.put(updated);
          queueLocalMutation(tx, 'habit-tracker', id, 'upsert', { habit: updated, before: request.result });
        } catch (error) { fail(error as Error); }
      };
    }
  ));
  broadcastChange();
}

export async function deleteHabit(id: string): Promise<void> {
  await withDatabase(db => transaction<void>(
    db, ['habits', 'policies', 'checkins', OUTBOX_STORE, SYNC_META_STORE], 'readwrite', tx => {
      tx.objectStore('habits').delete(id);
      queueLocalMutation(tx, 'habit-tracker', id, 'delete', { id });
      for (const name of ['policies', 'checkins'] as const) {
        const store = tx.objectStore(name);
        const request = store.index('habitId').openKeyCursor(IDBKeyRange.only(id));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          store.delete(cursor.primaryKey);
          cursor.continue();
        };
      }
    }
  ));
  broadcastChange();
}

/**
 * Atomic per-date read-modify-write. The read occurs within the same IDB
 * readwrite transaction as the put, preventing lost increments across tabs.
 * No write is allowed for future dates or a date outside the habit lifecycle.
 */
export async function mutateHabitCheckin(
  id: string, date: LocalDate, command: CheckinCommand
): Promise<void> {
  if (!isLocalDate(date) || date > await currentTrackingDate()) {
    throw new RangeError('Cannot record progress for a future or invalid date.');
  }
  await withDatabase(db => transaction<void>(
    db, ['habits', 'policies', 'checkins', OUTBOX_STORE, SYNC_META_STORE], 'readwrite', (tx, _set, fail) => {
      const habitRequest = tx.objectStore('habits').get(id);
      habitRequest.onsuccess = () => {
        const habit = habitRequest.result as HabitDefinition | undefined;
        if (!habit) { fail(new HabitStorageError('Habit not found.')); return; }
        if (habit.status !== 'ACTIVE') {
          fail(new HabitStorageError('Archived habits cannot accept new check-ins.')); return;
        }
        const policiesRequest = tx.objectStore('policies').index('habitId').getAll(id);
        policiesRequest.onsuccess = () => {
          try {
            const policy = resolveEffectivePolicy(id, date, policiesRequest.result as GoalPolicy[]);
            const store = tx.objectStore('checkins');
            const currentRequest = store.get(id + ':' + date);
            currentRequest.onsuccess = () => {
              try {
                const current = currentRequest.result as HabitCheckin | undefined;
                if (current) enforceValid(validateCheckin(current, policy));
                const next = applyCheckinCommand(habit, policy, current, date, command);
                const persisted = next ? { ...next, recordedAt: new Date().toISOString(), id: id + ':' + date } : null;
                if (persisted) store.put(persisted);
                else store.delete(id + ':' + date);
                queueLocalMutation(tx, 'habit-tracker', id + ':' + date, 'command', {
                  command, before: current ?? null, after: persisted, habitId: id, localDate: date
                });
              } catch (error) { fail(error as Error); }
            };
          } catch (error) { fail(error as Error); }
        };
      };
    }
  ));
  broadcastChange();
}

/** Compatibility for existing M1 boolean callers. */
export async function setDailyCompleted(id: string, date: LocalDate, complete: boolean): Promise<void> {
  if (date !== await currentTrackingDate()) throw new RangeError('M1 boolean check-ins require today.');
  await mutateHabitCheckin(id, date, complete ? { type: 'set', value: 1 } : { type: 'clear' });
}

/** Restore all related entities atomically inside this feature's IndexedDB. */
export async function replaceHabitSnapshotForRestore(input: HabitSnapshot): Promise<void> {
  const snapshot = validateHabitSnapshot(input);
  if (!snapshot.trackingTimezone) {
    throw new HabitStorageError('Backup is missing the tracking timezone.');
  }
  await withDatabase(db => transaction<void>(
    db, ['habits', 'policies', 'checkins', 'preferences', OUTBOX_STORE, SYNC_META_STORE, INBOX_STORE, TOMBSTONE_STORE], 'readwrite',
    (tx, set) => {
      const habits = tx.objectStore('habits');
      const policies = tx.objectStore('policies');
      const checkins = tx.objectStore('checkins');
      const prefs = tx.objectStore('preferences');
      habits.clear();
      policies.clear();
      checkins.clear();
      prefs.clear();
      for (const habit of snapshot.habits) habits.add(habit);
      for (const policy of snapshot.policies) policies.add(policy);
      for (const checkin of snapshot.checkins) checkins.add(checkin);
      prefs.put({ id: 'tracking', trackingTimezone: snapshot.trackingTimezone });
      resetCaptureAfterRestore(tx);
      resetInboxAfterRestore(tx);
      set(undefined);
    }
  ));
  broadcastChange();
}

/** Public feature-owned transport boundary. No other module opens this database. */
export function readHabitPendingSyncOperations(limit = 100) {
  return withDatabase(db => readOutbox(db, 'habit-tracker', limit));
}
export function acknowledgeHabitSyncOperations(operationIds: readonly string[]) {
  return withDatabase(db => acknowledgeOutbox(db, operationIds));
}

/**
 * Sync enrollment MUST snapshot existing feature state and enable capture in
 * one write transaction. The global coordinator is not allowed to construct
 * this baseline from a prior, potentially stale UI snapshot.
 */
export async function beginHabitSyncCapture(deviceId: string): Promise<void> {
  await loadHabitSnapshot(); // seed pinned timezone for a fresh database
  await withDatabase(db => transaction<void>(
    db, ['habits', 'policies', 'checkins', 'preferences', OUTBOX_STORE, SYNC_META_STORE],
    'readwrite',
    (tx, set, fail) => {
      const result: HabitSnapshot = { habits: [], policies: [], checkins: [] };
      let completed = 0;
      const ready = () => {
        completed++;
        if (completed !== 4) return;
        try {
          validateHabitSnapshot(result);
          initializeCaptureWithBaseline(tx, 'habit-tracker', deviceId, result);
          set(undefined);
        } catch (cause) { fail(cause instanceof Error ? cause : new HabitStorageError('Invalid Habit baseline.')); }
      };
      const habits = tx.objectStore('habits').getAll();
      habits.onsuccess = () => { result.habits = habits.result; ready(); };
      const policies = tx.objectStore('policies').getAll();
      policies.onsuccess = () => { result.policies = policies.result; ready(); };
      const checkins = tx.objectStore('checkins').getAll();
      checkins.onsuccess = () => { result.checkins = checkins.result; ready(); };
      const timezone = tx.objectStore('preferences').get('tracking');
      timezone.onsuccess = () => {
        const value: unknown = timezone.result?.trackingTimezone;
        if (typeof value !== 'string' || !isSupportedTimezone(value)) {
          fail(new HabitStorageError('Cannot sync without a valid pinned tracking timezone.')); return;
        }
        result.trackingTimezone = value;
        ready();
      };
    }
  ));
}

/**
 * Apply sequenced remote operations without ever bypassing Habit domain validation.
 * Entity mutations, tombstones, operation receipts, and cursor advance share
 * a single transaction. Any divergent prior state aborts the WHOLE batch.
 */
export function readHabitRemoteCursor(): Promise<number> {
  return withDatabase(readInboxCursor);
}
export async function applyHabitRemoteChanges(events: readonly SequencedSyncOperation[]): Promise<void> {
  if (!events.length) return;
  await withDatabase(db => transaction<void>(
    db, ['habits', 'policies', 'checkins', 'preferences',
      OUTBOX_STORE, SYNC_META_STORE, INBOX_STORE, TOMBSTONE_STORE],
    'readwrite', (tx, done, fail) => {
      const habits = tx.objectStore('habits');
      const policies = tx.objectStore('policies');
      const checkins = tx.objectStore('checkins');
      const prefs = tx.objectStore('preferences');
      const tombstones = tx.objectStore(TOMBSTONE_STORE);
      const conflict = (reason: string) => fail(new RemoteApplyConflict(reason));
      applyIncomingInTransaction(tx, 'habit-tracker', events, (event, next, stop) => {
        const payload = event.payload;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          stop(new RemoteApplyConflict('Invalid Habit remote event.')); return;
        }
        const data = payload as Record<string, unknown>;
        if (event.kind === 'baseline') {
          let backup: HabitSnapshot;
          try {
            if (!Array.isArray(data.habits) || !Array.isArray(data.policies) ||
                !Array.isArray(data.checkins) || typeof data.trackingTimezone !== 'string') {
              throw new RemoteApplyConflict('Incomplete Habit baseline.');
            }
            backup = validateHabitSnapshot(data as unknown as HabitSnapshot);
          } catch (error) {
            stop(error instanceof Error ? error : new RemoteApplyConflict('Invalid Habit baseline.')); return;
          }
          const h = habits.getAll(), p = policies.getAll(), c = checkins.getAll(), tz = prefs.get('tracking');
          let ready = 0;
          const finish = () => {
            if (++ready !== 4) return;
            const localZone: unknown = tz.result?.trackingTimezone;
            if (localZone && localZone !== backup.trackingTimezone) {
              stop(new RemoteApplyConflict('Habit tracking timezone differs across devices.')); return;
            }
            if (h.result.length || p.result.length || c.result.length) {
              const local = { habits: h.result, policies: p.result, checkins: c.result,
                trackingTimezone: backup.trackingTimezone };
              const byId = <T extends { id: string }>(rows: readonly T[]) =>
                [...rows].sort((a,b) => a.id.localeCompare(b.id));
              const byCheckin = (rows: readonly HabitCheckin[]) =>
                [...rows].sort((a,b) => (a.habitId + ':' + a.localDate).localeCompare(b.habitId + ':' + b.localDate));
              if (JSON.stringify({
                habits: byId(local.habits), policies: byId(local.policies), checkins: byCheckin(local.checkins)
              }) !== JSON.stringify({
                habits: byId(backup.habits),
                policies: byId(backup.policies),
                checkins: byCheckin(backup.checkins)
              })) {
                stop(new RemoteApplyConflict('Habit baseline requires a manual merge.')); return;
              }
              next(); return;
            }
            for (const row of backup.habits) habits.add(row);
            for (const row of backup.policies) policies.add(row);
            for (const row of backup.checkins) checkins.add(row);
            prefs.put({ id: 'tracking', trackingTimezone: backup.trackingTimezone });
            next();
          };
          h.onsuccess=finish; p.onsuccess=finish; c.onsuccess=finish; tz.onsuccess=finish;
          return;
        }
        if (event.kind === 'upsert') {
          try {
            const habit = data.habit as HabitDefinition;
            if (!habit || habit.id !== event.entityId) throw new RemoteApplyConflict('Habit ID mismatch.');
            enforceValid(validateHabit(habit));
            if (data.policy != null) {
              const policy = data.policy as GoalPolicy;
              if (policy.habitId !== habit.id) throw new RemoteApplyConflict('Policy owner mismatch.');
              enforceValid(validateGoalPolicy(policy, habit.direction));
            }
            const tombstone = tombstones.get(event.entityId);
            tombstone.onsuccess = () => {
              if (tombstone.result) { conflict('Deleted Habit cannot be resurrected.'); return; }
              const current = habits.get(event.entityId);
              current.onsuccess = () => {
                const previous: unknown = current.result;
                if (previous === undefined && data.before != null) {
                  conflict('Missing prior Habit revision.'); return;
                }
                if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(habit) &&
                    JSON.stringify(previous) !== JSON.stringify(data.before)) {
                  conflict('Concurrent Habit edit requires manual resolution.'); return;
                }
                if (previous === undefined) habits.add(habit);
                else if (JSON.stringify(previous) !== JSON.stringify(habit)) habits.put(habit);
                if (data.policy != null) {
                  const policy = data.policy as GoalPolicy;
                  const existingPolicy = policies.get(policy.id);
                  existingPolicy.onsuccess = () => {
                    if (existingPolicy.result && JSON.stringify(existingPolicy.result) !== JSON.stringify(policy)) {
                      conflict('Conflicting Habit policy ID.'); return;
                    }
                    if (!existingPolicy.result) policies.add(policy);
                    next();
                  };
                } else next();
              };
            };
          } catch (error) { stop(error instanceof Error ? error : new RemoteApplyConflict('Invalid Habit edit.')); }
          return;
        }
        if (event.kind === 'command') {
          const id = data.habitId, date = data.localDate;
          if (typeof id !== 'string' || !isLocalDate(date as string) ||
              event.entityId !== id + ':' + date) {
            stop(new RemoteApplyConflict('Invalid remote check-in identity.')); return;
          }
          const getHabit = habits.get(id);
          getHabit.onsuccess = () => {
            if (!getHabit.result) { conflict('Check-in references missing Habit.'); return; }
            const req = policies.index('habitId').getAll(id);
            req.onsuccess = () => {
              try {
                const policy = resolveEffectivePolicy(id, date as LocalDate, req.result as GoalPolicy[]);
                const existing = checkins.get(event.entityId);
                existing.onsuccess = () => {
                  const before = existing.result ?? null;
                  const after = data.after ?? null;
                  if (JSON.stringify(before) !== JSON.stringify(data.before ?? null) &&
                      JSON.stringify(before) !== JSON.stringify(after)) {
                    conflict('Concurrent Habit check-in requires manual resolution.'); return;
                  }
                  if (after !== null) {
                    const checkin = after as HabitCheckin;
                    enforceValid(validateCheckin(checkin, policy));
                    if (checkin.habitId !== id || checkin.localDate !== date) {
                      conflict('Check-in identity mismatch.'); return;
                    }
                    checkins.put({ ...checkin, id: event.entityId });
                  } else checkins.delete(event.entityId);
                  next();
                };
              } catch (error) { stop(error instanceof Error ? error : new RemoteApplyConflict('Invalid remote check-in.')); }
            };
          };
          return;
        }
        if (event.kind === 'delete' && data.id === event.entityId) {
          habits.delete(event.entityId);
          tombstones.put({ id: event.entityId, sequence: event.sequence });
          for (const store of [policies, checkins]) {
            const req = store.index('habitId').openKeyCursor(IDBKeyRange.only(event.entityId));
            req.onsuccess = () => {
              const cursor = req.result;
              if (!cursor) return;
              store.delete(cursor.primaryKey);
              cursor.continue();
            };
          }
          next(); return;
        }
        stop(new RemoteApplyConflict('Unsupported Habit remote event.'));
      }, () => done(undefined), fail);
    }
  ));
  broadcastChange();
}

/** Activate capture only after validated inbound journal is committed. */
export async function beginHabitRemoteCapture(deviceId: string): Promise<void> {
  await withDatabase(db => transaction<void>(
    db, [SYNC_META_STORE, OUTBOX_STORE], 'readwrite', (tx, complete) => {
      activateCaptureFromRemote(tx, deviceId);
      complete(undefined);
    }
  ));
}
