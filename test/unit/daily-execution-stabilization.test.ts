import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DailyStorageConflictError,
  readExecutionSnapshot,
  saveExecutionStateIfCurrent
} from '../../src/lib/modules/daily-execution/adapters/persistence.ts';
import {
  emptyExecutionState, currentForDay, localDayKey,
  selectForDay, tasksForDay, sameEditableTask, type ExecutionTask
} from '../../src/lib/modules/daily-execution/core/planning.ts';

function setup() {
  const entries = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); }
  });
  return entries;
}
const KEY = 'modu-daily-execution-v1';
const task = (id: string): ExecutionTask => ({
  id, title: 'Task ' + id, nextAction: '', workstream: 'general',
  impact: 'medium', estimateMinutes: 0, createdAt: 1, status: 'ready'
});
afterEach(() => vi.unstubAllGlobals());

describe('Daily M1.6 storage safety', () => {
  it('reads a new installation without creating a record', () => {
    const entries = setup();
    const read = readExecutionSnapshot();
    expect(read.raw).toBeNull();
    expect(read.state.tasks).toEqual([]);
    expect(entries.has(KEY)).toBe(false);
  });

  it('keeps corrupted JSON intact and never treats it as a writable empty state', () => {
    const entries = setup();
    entries.set(KEY, '{broken');
    expect(() => readExecutionSnapshot()).toThrow();
    expect(entries.get(KEY)).toBe('{broken');
  });

  it('rejects malformed stored tasks without deleting valid neighbours', () => {
    const entries = setup();
    const raw = JSON.stringify({...emptyExecutionState(), tasks: [task('valid'), {id:'invalid',title:'Bad'}]});
    entries.set(KEY, raw);
    expect(() => readExecutionSnapshot()).toThrow('Invalid Daily tasks');
    expect(entries.get(KEY)).toBe(raw);
  });

  it('fails closed if normalization of a malformed legacy plan throws', () => {
    const entries = setup();
    const broken = JSON.stringify({...emptyExecutionState(), plans:{
      '2026-10-13':{dateKey:'2026-10-13', allocations:{},revision:{reason:'incomplete'}}
    }});
    entries.set(KEY,broken);
    expect(() => readExecutionSnapshot()).toThrow();
    expect(entries.get(KEY)).toBe(broken);
  });

  it('rejects inaccessible browser storage and keeps the original data', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {throw new Error('SecurityError');},
      setItem: () => {throw new Error('SecurityError');}
    });
    expect(() => readExecutionSnapshot()).toThrow('SecurityError');
    expect(() => saveExecutionStateIfCurrent(emptyExecutionState(), null)).toThrow('SecurityError');
  });

  it('rejects a stale cross-tab save instead of replacing the other tab data', () => {
    const entries = setup();
    const original = JSON.stringify({...emptyExecutionState(),tasks:[task('one')]});
    entries.set(KEY,original);
    const tabA = readExecutionSnapshot();
    const fromOtherTab = JSON.stringify({...emptyExecutionState(),tasks:[task('one'),task('two')]});
    entries.set(KEY,fromOtherTab);
    expect(() => saveExecutionStateIfCurrent(tabA.state, tabA.raw)).toThrow(DailyStorageConflictError);
    expect(entries.get(KEY)).toBe(fromOtherTab);
    expect(readExecutionSnapshot().state.tasks.map(t=>t.id)).toEqual(['one','two']);
  });

  it('saves the active snapshot and roundtrips day membership', () => {
    const entries = setup();
    const first = readExecutionSnapshot();
    const updated = selectForDay({...first.state,tasks:[task('walk')]},'walk','2026-10-13');
    const raw = saveExecutionStateIfCurrent(updated, first.raw);
    expect(entries.get(KEY)).toBe(raw);
    expect(tasksForDay(readExecutionSnapshot().state,'2026-10-13')[0].id).toBe('walk');
    expect(currentForDay(readExecutionSnapshot().state,'2026-10-14')).toBeNull();
  });

  it('rejects changes to fields a user is editing when another tab updated that activity', () => {
    const original = task('one');
    expect(sameEditableTask(original, {...original})).toBe(true);
    expect(sameEditableTask(original, {...original,title:'Updated elsewhere'})).toBe(false);
    expect(sameEditableTask(original, {...original,context:'Personal'})).toBe(false);
    expect(sameEditableTask(original, {...original,status:'done'})).toBe(false);
  });

  it('preserves local calendar boundaries instead of carrying activity to a new date', () => {
    const initial = {...emptyExecutionState(), tasks:[task('one')]};
    const dayOne = localDayKey(new Date(2026,9,13,23,59,59).getTime());
    const dayTwo = localDayKey(new Date(2026,9,14,0,0,1).getTime());
    const selected = selectForDay(initial,'one',dayOne);
    expect(dayOne).not.toBe(dayTwo);
    expect(tasksForDay(selected,dayTwo)).toEqual([]);
    expect(tasksForDay(selected,dayOne).map(t=>t.id)).toEqual(['one']);
  });
});
