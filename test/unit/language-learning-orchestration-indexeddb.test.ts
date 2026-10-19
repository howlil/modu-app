import 'fake-indexeddb/auto';
import {beforeEach,describe,expect,it} from 'vitest';
import {learningPersistence} from '../../src/lib/modules/language-learning/adapters/persistence.ts';
import type {LanguageIsland} from '../../src/lib/modules/language-learning/core/learning.ts';
import type {PracticeCommand} from '../../src/lib/modules/language-learning/core/persistence.ts';

const island:LanguageIsland={id:'cafe',revision:1,title:'Cafe',sourceLanguage:'id',targetLanguage:'en',
  sentences:[{id:'coffee',revision:1,prompt:'Kopi',answer:'Coffee'},
    {id:'tea',revision:1,prompt:'Teh',answer:'Tea'}]};
const en={id:'en-profile',targetLanguage:'en'};
const ja={id:'ja-profile',targetLanguage:'ja'};
async function rated(sessionId:string,profileId:string,rating:'again'|'hard'|'good'|'easy',
  recordedAt:number,source:LanguageIsland=island){
  const start:PracticeCommand={type:'start',sessionId,profileId,mode:'recall',
    island:{...source,sentences:[source.sentences[0]]}};
  const created=await learningPersistence.execute(start,null);
  const revealed=await learningPersistence.execute({type:'reveal',sessionId},created.revision);
  return learningPersistence.execute({type:'attempt',sessionId,attempt:{
    attemptId:sessionId+'-rated',sentenceId:source.sentences[0].id,
    sentenceRevision:source.sentences[0].revision,
    evidence:{kind:'recall',rating},recordedAt
  }},revealed.revision);
}
const wipe=()=>new Promise<void>((resolve,reject)=>{
  const req=indexedDB.deleteDatabase('modu-language-learning');
  req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);
  req.onblocked=()=>reject(new Error('Leaked IndexedDB connection'));
});
beforeEach(wipe);
describe('M4 IndexedDB snapshot planning',()=>{
  it('reads M3 due and current catalog in one browser snapshot',async()=>{
    await rated('attempt-one',en.id,'again',1000);
    const before=await learningPersistence.plan(en,[island],{now:2000,maxItems:5,maxNew:2});
    expect(before.dueCount).toBe(0);
    expect(before.newCount).toBe(1);
    expect(before.tasks.map(t=>t.kind)).toEqual(['new']);
    const after=await learningPersistence.plan(en,[island],{
      now:1000+10*60_000,maxItems:5,maxNew:2});
    expect(after.dueCount).toBe(1);
    expect(after.tasks.map(t=>t.kind)).toEqual(['relearning','new']);
    expect((await learningPersistence.getMemory(en.id,'cafe','coffee',1))?.lastAttemptId)
      .toBe('attempt-one-rated');
  });
  it('ignores stale revisions even when old due records appear earlier in index',async()=>{
    await rated('attempt-one',en.id,'again',1000);
    const updated:LanguageIsland={...island,sentences:[
      {...island.sentences[0],revision:2,prompt:'Saya ingin kopi',answer:'I want coffee'},
      island.sentences[1]
    ]};
    const plan=await learningPersistence.plan(en,[updated],{now:1000000,maxItems:1,maxNew:1});
    expect(plan.dueCount).toBe(0);
    expect(plan.excludedOldRevisions).toBe(1);
    expect(plan.tasks).toEqual([expect.objectContaining({kind:'new',
      sentenceId:'coffee',sentenceRevision:2})]);
  });
  it('isolates target-language profiles and prevents catalog mismatches',async()=>{
    await rated('english-a',en.id,'hard',1000);
    const jpIsland:LanguageIsland={...island,id:'jp',targetLanguage:'ja'};
    const p=await learningPersistence.plan(ja,[jpIsland],{now:1000+86_400_000});
    expect(p.dueCount).toBe(0);
    expect(p.newCount).toBe(2);
    await expect(learningPersistence.plan(ja,[island],{now:0}))
      .rejects.toMatchObject({code:'invalid'});
  });
  it('does not mutate session, attempt, or review history on plan reads',async()=>{
    await rated('test-plan',en.id,'good',1000);
    const backupBefore=JSON.parse(await learningPersistence.exportBackup());
    await learningPersistence.plan(en,[island],{now:1000+3*86_400_000});
    const backupAfter=JSON.parse(await learningPersistence.exportBackup());
    delete backupBefore.exportedAt;
    delete backupAfter.exportedAt;
    expect(backupAfter).toEqual(backupBefore);
  });
  it('reacts to a completed second rated session without double-applying one attempt',async()=>{
    await rated('first',en.id,'good',1000);
    const first=await learningPersistence.plan(en,[island],{now:1000+3*86_400_000});
    expect(first.dueCount).toBe(1);
    await rated('second',en.id,'easy',1000+3*86_400_000);
    const next=await learningPersistence.plan(en,[island],{now:1000+3*86_400_000});
    expect(next.dueCount).toBe(0);
    expect(next.newCount).toBe(1);
    expect((await learningPersistence.getMemory(en.id,'cafe','coffee',1))?.repetitions).toBe(2);
  });
});
