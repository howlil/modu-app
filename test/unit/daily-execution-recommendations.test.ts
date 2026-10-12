import { describe, expect, it } from 'vitest';
import { adjustRemainingAllocation, weeklyRecommendation } from '../../src/lib/modules/daily-execution/core/recommendations.ts';
import type { ExecutionTask } from '../../src/lib/modules/daily-execution/core/planning.ts';
import type { EvidenceRecord } from '../../src/lib/modules/daily-execution/core/evidence.ts';

const baseTask: ExecutionTask = {id:'t1',title:'Java mock',nextAction:'Practice',workstream:'interview',impact:'high',estimateMinutes:60,status:'ready',createdAt:1};
const assessment = (id:string): EvidenceRecord => ({
  id,kind:'assessment',source:'manual',title:'Java mock',observation:'Needs practice',
  occurredAt:new Date(2026,9,12,12).getTime(),topic:'Java concurrency',assessmentResult:'needs-practice',verification:'user-reported'
});
const today = new Date(2026,9,13,12).getTime();
describe('M3 recommendations',()=>{
  it('requires two explicitly tagged distinct assessments for a skill-gap claim',()=>{
    expect(weeklyRecommendation([baseTask],[assessment('e1')],[],'2026-10-12',today,[])).toBeNull();
    const found = weeklyRecommendation([baseTask],[assessment('e1'),assessment('e2')],[],'2026-10-12',today,[]);
    expect(found?.ruleId).toBe('repeated-assessment-gap');
    expect(found?.evidenceIds).toEqual(['e1','e2']);
  });
  it('does not infer skill gaps from unverified imports or stale assessments',()=>{
    const old={...assessment('old'),occurredAt:today-40*24*3_600_000};
    const other=assessment('new');
    expect(weeklyRecommendation([baseTask],[old,other],[],'2026-10-12',today,[])).toBeNull();
    expect(weeklyRecommendation([baseTask],[{...assessment('u1'),verification:'unverified'},{...assessment('u2'),verification:'unverified'}],[],'2026-10-12',today,[])).toBeNull();
  });
  it('a newer passed assessment suppresses an older weakness',()=>{
    const weak=[{...assessment('w1'),occurredAt:today-2*24*3_600_000},{...assessment('w2'),occurredAt:today-24*3_600_000}];
    const passed={...assessment('ok'),assessmentResult:'passed' as const,occurredAt:today-60_000};
    expect(weeklyRecommendation([baseTask],[...weak,passed],[],'2026-10-12',today,[])).toBeNull();
  });
  it('uses entered deadlines and never fabricates external verification',()=>{
    const found = weeklyRecommendation([{...baseTask,dueDate:'2026-10-14'}],[],[],'2026-10-12',today,[]);
    expect(found?.ruleId).toBe('upcoming-deadline');
    expect(found?.taskIds).toEqual(['t1']);
    expect(found?.dataLimitations).toContain('not an independently confirmed');
  });
  it('does not repeat an unchanged rejected recommendation',()=>{
    const records=[assessment('e1'),assessment('e2')];
    const proposed=weeklyRecommendation([baseTask],records,[],'2026-10-12',today,[]);
    expect(proposed).not.toBeNull();
    expect(weeklyRecommendation([baseTask],records,[],'2026-10-12',today,
      [{id:proposed!.id,status:'rejected',decidedAt:now()}])).toBeNull();
  });
  it('changes only remaining allocations, preserves their total and bounds transfer',()=>{
    const base={build:210,interview:120,apply:60,english:60,review:30,general:0};
    const result=adjustRemainingAllocation(base,'interview',60);
    expect(result.interview).toBe(180);
    expect(Object.values(result).reduce((a,b)=>a+b,0)).toBe(480);
    expect(base.build).toBe(210);
    expect(adjustRemainingAllocation({build:0,interview:0,apply:0,english:0,review:0,general:0},'interview',30).interview).toBe(0);
  });
});
function now(){return Date.now();}
