import { describe, expect, it } from 'vitest';
import {
  decodeMemoryState, isDue, memoryKey, rebuildMemoryStates,
  scheduleRatedAttempt, type MemoryState
} from '../../src/lib/modules/language-learning/core/memory.ts';
import type { PracticeAttempt, RecallRating } from '../../src/lib/modules/language-learning/core/learning.ts';

const MIN = 60_000, DAY = 24 * 60 * MIN;
function rated(id: string, rating: RecallRating, recordedAt: number, profileId='english',
  sentenceRevision = 1, sentenceId='hello'): PracticeAttempt {
  return { id, sessionId:'session-'+id, profileId, sentenceId, sentenceRevision,
    recordedAt, evidence:{kind:'recall',rating} };
}
describe('Language Learning M3 — pure review scheduling', () => {
  it.each([
    ['again',10*MIN,'learning',0,1],
    ['hard',DAY,'review',1,0],
    ['good',3*DAY,'review',1,0],
    ['easy',7*DAY,'review',1,0]
  ] as const)('schedules first %s correctly', (rating,interval,stage,repetitions,lapses) => {
    const first=scheduleRatedAttempt(null,rated('a1',rating,1_000), 'island')!;
    expect(first).toMatchObject({algorithmVersion:1,stage,intervalMs:interval,
      repetitions,lapses,lastAttemptId:'a1',profileId:'english'});
    expect(first.dueAt).toBe(1000+interval);
    expect(isDue(first,first.dueAt-1)).toBe(false);
    expect(isDue(first,first.dueAt)).toBe(true);
    expect(decodeMemoryState(JSON.parse(JSON.stringify(first)))).toEqual(first);
  });
  it('has bounded, monotonic intervals and deterministic relearning', () => {
    const first=scheduleRatedAttempt(null,rated('a1','good',0),'island')!;
    const second=scheduleRatedAttempt(first,rated('a2','easy',DAY),'island')!;
    expect(second.intervalMs).toBe(Math.round(3*DAY*3.5));
    expect(second.repetitions).toBe(2);
    const missed=scheduleRatedAttempt(second,rated('a3','again',2*DAY),'island')!;
    expect(missed.stage).toBe('relearning');
    expect(missed.lapses).toBe(1);
    expect(missed.repetitions).toBe(0);
    expect(missed.intervalMs).toBe(10*MIN);
    const recovered=scheduleRatedAttempt(missed,rated('a4','hard',3*DAY),'island')!;
    expect(recovered.stage).toBe('review');
    expect(recovered.intervalMs).toBe(DAY);
    expect(recovered.lapses).toBe(1);
    let current=recovered;
    for(let i=0;i<30;i++) current=scheduleRatedAttempt(
      current,rated('growth-'+i,'easy',4*DAY+i*DAY),'island')!;
    expect(current.intervalMs).toBe(365*DAY);
  });
  it('is repeat-safe, ignores exposure/skip, and isolates language and revision identity', () => {
    const attempt=rated('a1','good',1000);
    const state=scheduleRatedAttempt(null,attempt,'island')!;
    expect(scheduleRatedAttempt(state,attempt,'island')).toBe(state);
    const exposure:PracticeAttempt={...attempt,id:'listen',evidence:{kind:'exposure',medium:'listening'}};
    const skip:PracticeAttempt={...attempt,id:'skip',evidence:{kind:'skip'}};
    expect(scheduleRatedAttempt(state,exposure,'island')).toBe(state);
    expect(scheduleRatedAttempt(state,skip,'island')).toBe(state);
    expect(memoryKey({profileId:'english',islandId:'island',sentenceId:'hello',sentenceRevision:1}))
      .not.toBe(memoryKey({profileId:'japanese',islandId:'island',sentenceId:'hello',sentenceRevision:1}));
    expect(memoryKey({profileId:'english',islandId:'island',sentenceId:'hello',sentenceRevision:1}))
      .not.toBe(memoryKey({profileId:'english',islandId:'island',sentenceId:'hello',sentenceRevision:2}));
    expect(() => scheduleRatedAttempt(state,rated('a2','good',2000,'english',2),'island'))
      .toThrow();
  });
  it('replays older events and rejects duplicate historical attempts', () => {
    const events=[rated('later','easy',5000),rated('earlier','good',1000)]
      .map(attempt=>({attempt,islandId:'island'}));
    const states=rebuildMemoryStates(events);
    expect(states).toHaveLength(1);
    expect(states[0].lastAttemptId).toBe('later');
    expect(states[0].repetitions).toBe(2);
    expect(() => rebuildMemoryStates([...events,events[0]])).toThrow();
  });
  it('clamps system clock rollback without moving due time backwards', () => {
    const first=scheduleRatedAttempt(null,rated('a1','hard',DAY),'island')!;
    const second=scheduleRatedAttempt(first,rated('a2','good',0),'island')!;
    expect(second.lastReviewedAt).toBe(DAY);
    expect(second.dueAt).toBeGreaterThan(first.lastReviewedAt);
  });
  it('detects forged or corrupt memory rows', () => {
    const first=scheduleRatedAttempt(null,rated('a1','hard',DAY),'island')!;
    expect(() => decodeMemoryState({...first, dueAt:-1})).toThrow();
    expect(() => decodeMemoryState({...first, key:'other'})).toThrow();
    expect(() => decodeMemoryState({...first, algorithmVersion:2})).toThrow();
    expect(() => decodeMemoryState({...first, intervalMs:1})).toThrow();
  });
});
