import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeSimply, currentForDay, emptyExecutionState, removeFromDay, reopenSimply, selectForDay, setNextForDay, tasksForDay, moveForDay, unfinishedFromYesterday, bringForwardFromYesterday, previousLocalDayKey, type ExecutionTask } from '../../src/lib/modules/daily-execution/core/planning.ts';
import { readExecutionState, saveExecutionState } from '../../src/lib/modules/daily-execution/adapters/persistence.ts';

const task = (id:string):ExecutionTask => ({
  id, title:id, nextAction:'', workstream:'general', impact:'medium',
  estimateMinutes:0, status:'ready', createdAt:1
});
afterEach(() => vi.unstubAllGlobals());

describe('Daily v4', () => {
  it('keeps dated Today selection separate from task identity', () => {
    const initial = { ...emptyExecutionState(), tasks:[task('a'),task('b')] };
    const date = '2026-10-13';
    const withBoth = selectForDay(selectForDay(initial,'a',date),'b',date);
    expect(tasksForDay(withBoth,date).map(t=>t.id)).toEqual(['a','b']);
    expect(tasksForDay(withBoth,'2026-10-14')).toEqual([]);
    const prioritized = setNextForDay(withBoth,'b',date);
    expect(currentForDay(prioritized,date)?.id).toBe('b');
    expect(currentForDay(removeFromDay(prioritized,'b',date),date)?.id).toBe('a');
    expect(initial.tasks).toHaveLength(2);
  });
  it('completes without mandatory outcome and reopens', () => {
    const before = { ...emptyExecutionState(), tasks:[task('a')] };
    const done = completeSimply(before,'a',120);
    expect(done.tasks[0]).toMatchObject({status:'done',completedAt:120});
    const reopened = reopenSimply(done,'a');
    expect(reopened.tasks[0]).toMatchObject({id:'a',status:'ready'});
    expect(reopened.tasks[0].completedAt).toBeUndefined();
    expect(before.tasks[0].status).toBe('ready');
  });
  it('reorders only actionable Today tasks and preserves explicit next selection', () => {
    const date = '2026-10-13';
    const done = {...task('done'),status:'done' as const};
    const blocked = {...task('blocked'),status:'blocked' as const};
    let state = {...emptyExecutionState(),tasks:[task('a'),done,blocked,task('b'),task('c')]};
    for (const id of ['a','done','blocked','b','c']) state = selectForDay(state,id,date);
    state = setNextForDay(state,'c',date);
    const moved = moveForDay(state,'c',date,-1);
    expect(moved.days[date].taskIds).toEqual(['a','done','blocked','c','b']);
    expect(currentForDay(moved,date)?.id).toBe('c');
    expect(moveForDay(moved,'a',date,-1)).toBe(moved);
    expect(moveForDay(moved,'done',date,1)).toBe(moved);
    expect(state.days[date].taskIds).toEqual(['a','done','blocked','b','c']);
  });

  it('suggests only ready activities selected yesterday, never auto-carries them', () => {
    const day = '2026-10-13', yesterday = '2026-10-12';
    let state = {...emptyExecutionState(),tasks:[task('a'),task('b'),{...task('blocked'),status:'blocked' as const},{...task('done'),status:'done' as const}]};
    for (const id of ['a','blocked','b','done']) state = selectForDay(state,id,yesterday);
    state = selectForDay(state,'b',day);
    expect(unfinishedFromYesterday(state,day).map(t=>t.id)).toEqual(['a']);
    expect(state.days[day].taskIds).toEqual(['b']);
    const carried = bringForwardFromYesterday(state,day);
    expect(carried.days[day].taskIds).toEqual(['b','a']);
    expect(bringForwardFromYesterday(carried,day)).toBe(carried);
    expect(state.days[yesterday].taskIds).toEqual(['a','blocked','b','done']);
  });

  it('handles previous-day calculation across months, leap years, and year boundaries', () => {
    expect(previousLocalDayKey('2026-03-01')).toBe('2026-02-28');
    expect(previousLocalDayKey('2024-03-01')).toBe('2024-02-29');
    expect(previousLocalDayKey('2026-01-01')).toBe('2025-12-31');
  });

  it('reads legacy storage while preserving IDs and checkpoints', () => {
    const data = new Map<string,string>();
    vi.stubGlobal('localStorage', {
      getItem: (key:string) => data.get(key)??null,
      setItem: (key:string,value:string) => {data.set(key,value);},
      removeItem: (key:string) => data.delete(key)
    });
    const record = { ...emptyExecutionState(), days:undefined, dayNotes:undefined,
      plans:{'2026-10-12':{dateKey:'2026-10-12',mode:'medium',allocations:{build:210,interview:120,apply:60,english:60,review:30}}},
      tasks:[{...task('legacy'),workstream:'interview',
        checkpoint:{lastCompleted:'Done',blocker:'',nextAction:'Continue',updatedAt:10}}] };
    data.set('modu-daily-execution-v1',JSON.stringify(record));
    const restored = readExecutionState();
    expect(restored.days).toEqual({});
    expect(restored.plans['2026-10-12'].allocations.general).toBe(0);
    expect(restored.tasks[0].checkpoint?.nextAction).toBe('Continue');
    saveExecutionState(selectForDay(restored,'legacy','2026-10-13'));
    expect(readExecutionState().days['2026-10-13'].taskIds).toEqual(['legacy']);
  });
});