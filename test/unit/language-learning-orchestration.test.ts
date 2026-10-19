import { describe, expect, it } from 'vitest';
import { createLearningPlan, recommendedIsland, type LearningProfile } from '../../src/lib/modules/language-learning/core/orchestration.ts';
import { scheduleRatedAttempt, type MemoryState } from '../../src/lib/modules/language-learning/core/memory.ts';
import type { LanguageIsland, PracticeAttempt } from '../../src/lib/modules/language-learning/core/learning.ts';

const day=86_400_000;
const profile:LearningProfile={id:'profile-en',targetLanguage:'en'};
const islands:LanguageIsland[]=[
  {id:'cafe',title:'Cafe',revision:1,sourceLanguage:'id',targetLanguage:'en',sentences:[
    {id:'coffee',revision:1,prompt:'Kopi',answer:'Coffee'},
    {id:'tea',revision:1,prompt:'Teh',answer:'Tea'}
  ]},
  {id:'travel',title:'Travel',revision:1,sourceLanguage:'id',targetLanguage:'en',sentences:[
    {id:'train',revision:1,prompt:'Kereta',answer:'Train'},
    {id:'ticket',revision:1,prompt:'Tiket',answer:'Ticket'}
  ]}
];
function state(islandId:string,sentenceId:string,rating:'again'|'hard'|'good'|'easy',time:number,
  revision=1,profileId=profile.id):MemoryState{
  const attempt:PracticeAttempt={
    id:islandId+'-'+sentenceId+'-'+rating+'-'+revision,
    sessionId:'session',profileId,sentenceId,sentenceRevision:revision,recordedAt:time,
    evidence:{kind:'recall',rating}
  };
  return scheduleRatedAttempt(null,attempt,islandId)!;
}
const plan=(states:MemoryState[],now:number,options: {maxItems?:number;maxNew?:number}={})=>
  createLearningPlan({profile,islands,states,options:{now,...options}});
describe('M4 — deterministic learning orchestration',()=>{
  it('prioritizes due relearning, then due review, then bounded unseen content',()=>{
    const relearning=state('travel','ticket','again',0);
    const reviewed=state('cafe','coffee','hard',0);
    const result=plan([reviewed,relearning],2*day,{maxItems:4,maxNew:1});
    expect(result.tasks.map(t=>[t.kind,t.islandId,t.sentenceId])).toEqual([
      ['relearning','travel','ticket'],
      ['review','cafe','coffee'],
      ['new','cafe','tea']
    ]);
    expect(result.dueCount).toBe(2);
    expect(result.newCount).toBe(2);
    expect(result.allCaughtUp).toBe(false);
  });
  it('does not schedule future reviews early or treat them as new',()=>{
    const a=state('cafe','coffee','good',0);
    const b=state('cafe','tea','easy',0);
    const c=state('travel','train','hard',0);
    const d=state('travel','ticket','good',0);
    const result=plan([a,b,c,d],0);
    expect(result.tasks).toHaveLength(0);
    expect(result.allCaughtUp).toBe(true);
    expect(result.upcomingCount).toBe(4);
    expect(result.newCount).toBe(0);
  });
  it('reintroduced revisions become new, retired memory never takes a slot',()=>{
    const old=state('cafe','coffee','again',0,1);
    const changed:LanguageIsland[]=islands.map(i=>i.id==='cafe' ? {...i,sentences:[
      {...i.sentences[0],revision:2,answer:'A coffee'},i.sentences[1]
    ]}:i);
    const result=createLearningPlan({profile,islands:changed,states:[old],options:{now:day,maxNew:2}});
    expect(result.excludedOldRevisions).toBe(1);
    expect(result.dueCount).toBe(0);
    expect(result.tasks[0]).toMatchObject({kind:'new',islandId:'cafe',
      sentenceId:'coffee',sentenceRevision:2});
    expect(result.tasks.every(t=>t.sentenceRevision!==1 || t.sentenceId!=='coffee')).toBe(true);
  });
  it('forms a one-Island practice batch while respecting recommendation order',()=>{
    const first=state('travel','train','again',0);
    const second=state('travel','ticket','hard',0);
    const result=plan([first,second],2*day,{maxItems:4,maxNew:2});
    const selected=recommendedIsland(result,islands)!;
    expect(selected.id).toBe('travel');
    expect(selected.sentences.map(x=>x.id)).toEqual(['train','ticket']);
    expect(selected.sentences).toHaveLength(2);
    const changed=islands.map(i=>i.id==='travel'?{...i,sentences:i.sentences.filter(s=>s.id!=='train')}:i);
    expect(()=>recommendedIsland(result,changed)).toThrow();
  });
  it('never pulls a later new Island item ahead of an intervening due review',()=>{
    const travelFailed=state('travel','train','again',0);
    const cafeReview=state('cafe','coffee','hard',0);
    const result=plan([travelFailed,cafeReview],2*day,{maxItems:4,maxNew:2});
    expect(result.tasks.map(t=>[t.kind,t.islandId])).toEqual([
      ['relearning','travel'],['review','cafe'],['new','cafe'],['new','travel']
    ]);
    const batch=recommendedIsland(result,islands);
    expect(batch?.sentences.map(s=>s.id)).toEqual(['train']);
  });
  it('respects due capacity, new limits, and consistent ordering',()=>{
    const a=state('cafe','tea','hard',0);
    const b=state('cafe','coffee','hard',0);
    const p1=plan([a,b],2*day,{maxItems:2,maxNew:0});
    const p2=plan([b,a],2*day,{maxItems:2,maxNew:0});
    expect(p1.tasks).toEqual(p2.tasks);
    expect(p1.tasks.map(t=>t.sentenceId)).toEqual(['coffee','tea']);
    expect(p1.newCount).toBe(2);
    expect(p1.tasks.every(t=>t.kind!=='new')).toBe(true);
  });
  it('rejects mixed languages, duplicated Island/sentence IDs, alien profile states and unsafe limits',()=>{
    expect(()=>plan([state('cafe','coffee','hard',0,1,'profile-ja')],day)).toThrow();
    expect(()=>createLearningPlan({profile,islands:[
      {...islands[0],targetLanguage:'ja'}],states:[],options:{now:day}})).toThrow();
    expect(()=>createLearningPlan({profile,islands:[
      islands[0],islands[0]],states:[],options:{now:day}})).toThrow();
    expect(()=>createLearningPlan({profile,islands:[
      {...islands[0],sentences:[islands[0].sentences[0],islands[0].sentences[0]]}
    ],states:[],options:{now:day}})).toThrow();
    expect(()=>plan([],day,{maxNew:4,maxItems:2})).toThrow();
    expect(()=>plan([],-1)).toThrow();
  });
  it('returns a genuine all-caught-up state for an empty catalog',()=>{
    const result=createLearningPlan({profile,islands:[],states:[],options:{now:0}});
    expect(result.tasks).toEqual([]);
    expect(result.allCaughtUp).toBe(true);
    expect(recommendedIsland(result,[])).toBe(null);
  });
});
