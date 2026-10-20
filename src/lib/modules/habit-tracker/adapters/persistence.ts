import type { GoalPolicy, HabitCheckin, HabitDefinition, LocalDate } from '../core/types.ts';
import { isLocalDate, resolveEffectivePolicy } from '../core/scheduling.ts';
import {
  archiveHabit, booleanCheckin, makeDailyBooleanHabit, renameHabit, restoreHabit
} from '../core/management.ts';
import { validateCheckin, validateGoalPolicy, validateHabit } from '../core/validation.ts';
import { browserLocalDate, browserTimezone, isSupportedTimezone } from './browser-date.ts';
import { applyCheckinCommand, makeConfiguredDailyHabit, type CheckinCommand, type HabitSetup } from '../core/progress.ts';
import { createPolicyRevision, type PolicyRevisionInput } from '../core/policy.ts';

const DATABASE = 'modu-habit-tracker';
const VERSION = 2;
const CHANGE = 'modu:habit-changed';
const CHANNEL = 'modu-habit-tracker-changes';
type StoreName = 'habits' | 'policies' | 'checkins' | 'preferences';

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
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(new HabitStorageError('Unable to open the Habit Tracker database.'));
    request.onblocked = () => reject(new HabitStorageError('Close other tabs that are blocking database access, then retry.'));
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
    db, ['habits', 'policies'], 'readwrite', tx => {
      tx.objectStore('habits').add(habit);
      tx.objectStore('policies').add(policy);
    }
  ));
  broadcastChange();
}

export async function changeHabitTitle(id: string, title: string): Promise<void> {
  await withDatabase(db => transaction<void>(
    db, ['habits'], 'readwrite', (tx, _set, fail) => {
      const store = tx.objectStore('habits');
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) { fail(new HabitStorageError('Habit not found.')); return; }
        try { store.put(renameHabit(request.result as HabitDefinition, title)); }
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
    db, ['habits', 'policies'], 'readwrite', (tx, _set, fail) => {
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
    db, ['habits'], 'readwrite', (tx, _set, fail) => {
      const store = tx.objectStore('habits');
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) { fail(new HabitStorageError('Habit not found.')); return; }
        try {
          const previous = request.result as HabitDefinition;
          store.put(archive ? archiveHabit(previous, date) : restoreHabit(previous, date));
        } catch (error) { fail(error as Error); }
      };
    }
  ));
  broadcastChange();
}

export async function deleteHabit(id: string): Promise<void> {
  await withDatabase(db => transaction<void>(
    db, ['habits', 'policies', 'checkins'], 'readwrite', tx => {
      tx.objectStore('habits').delete(id);
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
    db, ['habits', 'policies', 'checkins'], 'readwrite', (tx, _set, fail) => {
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
                if (next) store.put({ ...next, recordedAt: new Date().toISOString(), id: id + ':' + date });
                else store.delete(id + ':' + date);
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
