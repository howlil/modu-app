import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createConfiguredHabit, deleteHabit, loadHabitSnapshot, mutateHabitCheckin,
  setHabitArchived, subscribeHabitChanges, updateHabitConfiguration, HabitStorageError
} from '../../src/lib/modules/habit-tracker/adapters/persistence.ts';
import { browserLocalDate, browserTimezone, isSupportedTimezone, reconcileTrackingDay } from '../../src/lib/modules/habit-tracker/adapters/browser-date.ts';
import { evaluateDailyOutcome } from '../../src/lib/modules/habit-tracker/core/evaluation.ts';
import type { HabitSnapshot } from '../../src/lib/modules/habit-tracker/adapters/persistence.ts';

const DATABASE = 'modu-habit-tracker';
const TODAY = '2026-10-20';
const CLOCK = new Date('2026-10-20T12:00:00.000Z');

function dropDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Habit DB connection was leaked by the previous test.'));
  });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(CLOCK);
  await dropDatabase();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function start(title = 'Read') {
  await loadHabitSnapshot(); // Initializes persisted timezone.
  await createConfiguredHabit({ title, direction: 'BUILD', measurement: 'COUNT',
    target: 3 }, TODAY);
  const saved = await loadHabitSnapshot();
  const habit = saved.habits.find(h => h.title === title)!;
  return { id: habit.id, saved };
}

function storeRecord(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
function openRaw(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = version ? indexedDB.open(DATABASE, version) : indexedDB.open(DATABASE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe('Habit Tracker M5 — actual IndexedDB adapter with fake-indexeddb transactions', () => {
  it('creates a v2 database with timezone preferences and preserves a committed check-in on reopen', async () => {
    const { id } = await start();
    await mutateHabitCheckin(id, TODAY, { type: 'set', value: 3 });
    const first = await loadHabitSnapshot();
    const second = await loadHabitSnapshot();
    expect(first).toEqual(second);
    expect(first.trackingTimezone).toBe(browserTimezone());
    expect(first.checkins).toMatchObject([{
      habitId: id, localDate: TODAY, value: 3, recordedAt: expect.any(String)
    }]);
    expect(evaluateDailyOutcome(first.habits[0], first.policies[0], first.checkins[0],
      TODAY, TODAY)).toBe('MET');
    const db = await openRaw();
    expect(db.version).toBe(2);
    expect([...db.objectStoreNames]).toContain('preferences');
    db.close();
  });

  it('upgrades a seeded v1 database without deleting or rewriting existing check-ins', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('habits', { keyPath: 'id' });
        const policies = db.createObjectStore('policies', { keyPath: 'id' });
        policies.createIndex('habitId', 'habitId', { unique: false });
        const checkins = db.createObjectStore('checkins', { keyPath: 'id' });
        checkins.createIndex('habitId', 'habitId', { unique: false });
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['habits', 'policies', 'checkins'], 'readwrite');
        tx.objectStore('habits').add({
          id: 'legacy', title: 'Legacy', direction: 'BUILD', status: 'ACTIVE', createdDate: TODAY
        });
        tx.objectStore('policies').add({
          id: 'legacy:initial', habitId: 'legacy', effectiveFromDate: TODAY,
          measurement: 'BOOLEAN', target: 1, schedule: { type: 'DAILY' }
        });
        tx.objectStore('checkins').add({
          id: 'legacy:' + TODAY, habitId: 'legacy', localDate: TODAY, value: 1
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
      request.onerror = () => reject(request.error);
    });
    const result = await loadHabitSnapshot();
    expect(result).toMatchObject({
      habits: [{ id: 'legacy' }], policies: [{ id: 'legacy:initial' }],
      checkins: [{ habitId: 'legacy', value: 1 }]
    });
    const db = await openRaw();
    expect(db.version).toBe(2);
    db.close();
    expect((await loadHabitSnapshot()).checkins).toEqual(result.checkins);
  });

  it('serializes concurrent tab-like increments against the latest stored value', async () => {
    const { id } = await start();
    const attempts = Array.from({ length: 12 }, () =>
      mutateHabitCheckin(id, TODAY, { type: 'adjust', delta: 1 }));
    await Promise.all(attempts);
    const snapshot = await loadHabitSnapshot();
    expect(snapshot.checkins).toHaveLength(1);
    expect(snapshot.checkins[0].value).toBe(12);
  });

  it('does not persist a partial rename when the corresponding policy revision is invalid', async () => {
    const { id } = await start();
    await expect(updateHabitConfiguration(id, 'Renamed by stale tab', {
      effectiveFromDate: '2026-10-21',
      target: -1, schedule: { type: 'DAILY' }
    }, TODAY, true)).rejects.toThrow();
    const saved = await loadHabitSnapshot();
    expect(saved.habits[0].title).toBe('Read');
    expect(saved.policies).toHaveLength(1);
  });

  it('rejects conflicting concurrent future revisions without replacing the winner', async () => {
    const { id } = await start();
    const updates = await Promise.allSettled([
      updateHabitConfiguration(id, 'Read', {
        effectiveFromDate: '2026-10-21', target: 4, schedule: { type: 'DAILY' }
      }, TODAY, true),
      updateHabitConfiguration(id, 'Read', {
        effectiveFromDate: '2026-10-21', target: 6, schedule: { type: 'DAILY' }
      }, TODAY, true)
    ]);
    expect(updates.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(updates.filter(x => x.status === 'rejected')).toHaveLength(1);
    const saved = await loadHabitSnapshot();
    expect(saved.policies).toHaveLength(2);
    const future = saved.policies.find(p => p.effectiveFromDate === '2026-10-21');
    expect(future).toBeDefined();
    expect([4, 6]).toContain(future!.target);
  });

  it('blocks same-day writes after archive while retaining previously committed records', async () => {
    const { id } = await start();
    await mutateHabitCheckin(id, TODAY, { type: 'set', value: 3 });
    await setHabitArchived(id, true, TODAY);
    await expect(mutateHabitCheckin(id, TODAY, { type: 'adjust', delta: 1 }))
      .rejects.toThrow('Archived habits');
    const archived = await loadHabitSnapshot();
    expect(archived.habits[0].status).toBe('ARCHIVED');
    expect(archived.checkins[0].value).toBe(3);
    await setHabitArchived(id, false, TODAY);
    await mutateHabitCheckin(id, TODAY, { type: 'adjust', delta: 1 });
    expect((await loadHabitSnapshot()).checkins[0].value).toBe(4);
  });

  it('deletes the habit, all revisions and check-ins in one transaction', async () => {
    const { id } = await start();
    await mutateHabitCheckin(id, TODAY, { type: 'set', value: 2 });
    await updateHabitConfiguration(id, 'Read', {
      effectiveFromDate: '2026-10-21', target: 5, schedule: { type: 'DAILY' }
    }, TODAY, true);
    await deleteHabit(id);
    const snapshot = await loadHabitSnapshot();
    expect(snapshot).toMatchObject({ habits: [], policies: [], checkins: [] });
    expect(snapshot.trackingTimezone).toBeTruthy();
  });

  it('rejects corrupt storage without overwriting rows or implicitly resetting the database', async () => {
    const { id } = await start();
    const db = await openRaw();
    const malformed = { id: id + ':' + TODAY, habitId: id, localDate: TODAY, value: -123 };
    await storeRecord(db, 'checkins', malformed);
    db.close();
    await expect(loadHabitSnapshot()).rejects.toThrow(HabitStorageError);
    const raw = await openRaw();
    const persisted = await new Promise<unknown>((resolve, reject) => {
      const tx = raw.transaction('checkins', 'readonly');
      const request = tx.objectStore('checkins').get(id + ':' + TODAY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    raw.close();
    expect(persisted).toMatchObject({ value: -123 });
  });

  it('keeps the previously pinned timezone after an environment change', async () => {
    await loadHabitSnapshot();
    const first = (await loadHabitSnapshot()).trackingTimezone;
    const db = await openRaw();
    await storeRecord(db, 'preferences', { id: 'tracking', trackingTimezone: 'Asia/Jakarta' });
    db.close();
    expect((await loadHabitSnapshot()).trackingTimezone).toBe('Asia/Jakarta');
    expect(first).toBeTruthy();
    expect(browserLocalDate(new Date('2026-10-20T18:00:00Z'), 'Asia/Jakarta')).toBe('2026-10-21');
  });

  it('rejects an invalid pinned timezone without deleting existing data', async () => {
    const { id } = await start();
    const db = await openRaw();
    await storeRecord(db, 'preferences', { id: 'tracking', trackingTimezone: 'Invalid/Zone' });
    db.close();
    await expect(loadHabitSnapshot()).rejects.toThrow('tracking timezone');
    const raw = await openRaw();
    expect([...raw.objectStoreNames]).toContain('habits');
    raw.close();
    expect(id).toBeTruthy();
  });

  it('fails cleanly when IndexedDB is inaccessible', async () => {
    await loadHabitSnapshot();
    vi.stubGlobal('indexedDB', undefined);
    await expect(loadHabitSnapshot()).rejects.toThrow('IndexedDB is unavailable');
  });

  it('notifies same-tab subscribers after commits and stops delivering after unsubscribe', async () => {
    await loadHabitSnapshot();
    vi.stubGlobal('window', new EventTarget());
    const onChange = vi.fn();
    const stop = subscribeHabitChanges(onChange);
    await createConfiguredHabit({ title: 'Walk', direction: 'BUILD', measurement: 'BOOLEAN' }, TODAY);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
    await createConfiguredHabit({ title: 'Water', direction: 'BUILD', measurement: 'BOOLEAN' }, TODAY);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('Habit Tracker M5 — local calendar rollover', () => {
  it('formats the same instant for different IANA zones without changing stored dates', () => {
    const instant = new Date('2026-10-20T23:45:00Z');
    expect(browserLocalDate(instant, 'UTC')).toBe('2026-10-20');
    expect(browserLocalDate(instant, 'Asia/Jakarta')).toBe('2026-10-21');
    expect(isSupportedTimezone('Pacific/Auckland')).toBe(true);
    expect(isSupportedTimezone('Invalid/Zone')).toBe(false);
  });

  it('follows today across midnight but preserves a manually selected historical day', () => {
    expect(reconcileTrackingDay('2026-10-20', '2026-10-20', '2026-10-21'))
      .toEqual({ today: '2026-10-21', selectedDate: '2026-10-21', changed: true });
    expect(reconcileTrackingDay('2026-10-20', '2026-10-18', '2026-10-21'))
      .toEqual({ today: '2026-10-21', selectedDate: '2026-10-18', changed: true });
    expect(reconcileTrackingDay('2026-10-20', '2026-10-20', '2026-10-20').changed)
      .toBe(false);
  });

  it('clamps a selected day that becomes a future date after timezone rollover', () => {
    expect(reconcileTrackingDay('2026-10-21', '2026-10-21', '2026-10-20'))
      .toMatchObject({ selectedDate: '2026-10-20', today: '2026-10-20' });
  });
});
