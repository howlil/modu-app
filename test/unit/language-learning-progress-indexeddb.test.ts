import 'fake-indexeddb/auto';
import {beforeEach,describe,expect,it} from 'vitest';
import {learningPersistence} from '../../src/lib/modules/language-learning/adapters/persistence.ts';
import type {LanguageIsland} from '../../src/lib/modules/language-learning/core/learning.ts';

const profile={id:'m6-en',targetLanguage:'en'};
const island:LanguageIsland={id:'travel',revision:1,title:'Travel',sourceLanguage:'id',
  targetLanguage:'en',sentences:[{id:'train',revision:1,prompt:'Kereta',answer:'Train'}]};
const wipe=()=>new Promise<void>((resolve,reject)=>{
  const req=indexedDB.deleteDatabase('modu-language-learning');
  req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);
  req.onblocked=()=>reject(new Error('DB handle leak'));
});
beforeEach(wipe);
async function perform(mode:'recall'|'listening'|'shadowing',kind:'recall'|'exposure'|'skip',id:string,
  at:number,rating:'again'|'hard'|'good'|'easy'='good') {
  const started=await learningPersistence.execute({type:'start',sessionId:id,
    profileId:profile.id,island,mode},null);
  const revealed=mode==='recall'
    ? await learningPersistence.execute({type:'reveal',sessionId:id},started.revision)
    : started;
  return learningPersistence.execute({type:'attempt',sessionId:id,attempt:{
    attemptId:'attempt-'+id,sentenceId:'train',sentenceRevision:1,
    recordedAt:at,evidence:kind==='recall'?{kind:'recall',rating}:
      kind==='exposure'?{kind:'exposure',medium:mode as 'listening'|'shadowing'}:{kind:'skip'}
  }},revealed.revision);
}
describe('M6 — IndexedDB progress snapshot',()=>{
  it('tracks durable recall and separate audio exposures across sessions and reloads',async()=>{
    await learningPersistence.createProfile(profile);
    await learningPersistence.saveIsland(profile.id,{
      id:'travel',title:'Travel',sourceLanguage:'id',targetLanguage:'en',
      sentences:[{id:'train',prompt:'Kereta',answer:'Train'}],vocabulary:[]
    },null);
    await perform('recall','recall','one',1000);
    await perform('listening','exposure','two',2000);
    await perform('shadowing','exposure','three',3000);
    const first=await learningPersistence.progress(profile,4000);
    expect(first).toMatchObject({ratedRecalls:1,successfulRecalls:1,
      listeningExposures:1,shadowingExposures:1,activeScheduled:1,dueNow:0,
      sessionsStarted:3,sessionsCompleted:3
    });
    expect(first.recent).toHaveLength(3);
    const again=await learningPersistence.progress(profile,4000);
    expect(again).toEqual(first);
    const due=await learningPersistence.progress(profile,1000+3*86_400_000);
    expect(due.dueNow).toBe(1);
  });
  it('drops archived content from current due, but keeps historical attempt counts',async()=>{
    await learningPersistence.createProfile(profile);
    const created=await learningPersistence.saveIsland(profile.id,{
      id:'travel',title:'Travel',sourceLanguage:'id',targetLanguage:'en',
      sentences:[{id:'train',prompt:'Kereta',answer:'Train'}],vocabulary:[]
    },null);
    await perform('recall','recall','old',1000,'again');
    await learningPersistence.setArchived(profile.id,'travel',created.island.revision,true);
    const result=await learningPersistence.progress(profile,1000+10*60_000);
    expect(result).toMatchObject({ratedRecalls:1,successfulRecalls:0,
      dueNow:0,activeScheduled:0});
    expect(result.recent[0].sentenceId).toBe('train');
  });
  it('restores matching progress after full backup without a duplicate analytics counter',async()=>{
    await learningPersistence.createProfile(profile);
    await perform('shadowing','exposure','shadow',1000);
    const before=await learningPersistence.progress(profile,2000);
    const backup=await learningPersistence.exportBackup();
    await learningPersistence.importBackup(backup);
    const after=await learningPersistence.progress(profile,2000);
    expect(after).toEqual(before);
    expect(after.shadowingExposures).toBe(1);
    expect(after.ratedRecalls).toBe(0);
  });
});
