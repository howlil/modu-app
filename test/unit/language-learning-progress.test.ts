import {describe,expect,it} from 'vitest';
import {applyPracticeCommand,type StoredPractice} from '../../src/lib/modules/language-learning/core/persistence.ts';
import type {LanguageIsland} from '../../src/lib/modules/language-learning/core/learning.ts';
import {projectLearningProgress} from '../../src/lib/modules/language-learning/core/progress.ts';
import {scheduleRatedAttempt} from '../../src/lib/modules/language-learning/core/memory.ts';

const profile={id:'user-en',targetLanguage:'en'};
const island:LanguageIsland={
  id:'cafe',revision:1,title:'Cafe',sourceLanguage:'id',targetLanguage:'en',
  sentences:[{id:'coffee',revision:1,prompt:'Kopi',answer:'Coffee'}]
};
function session(id:string,mode:'recall'|'listening'|'shadowing',evidence:
  {kind:'recall';rating:'again'|'hard'|'good'|'easy'}|
  {kind:'exposure';medium:'listening'|'shadowing'}|{kind:'skip'},
  when:number,owner=profile.id):StoredPractice{
  let record=applyPracticeCommand(null,{type:'start',sessionId:id,profileId:owner,
    island,mode}).next;
  if(mode==='recall') record=applyPracticeCommand(record,{type:'reveal',sessionId:id}).next;
  return applyPracticeCommand(record,{type:'attempt',sessionId:id,attempt:{
    attemptId:id+'-attempt',sentenceId:'coffee',sentenceRevision:1,
    recordedAt:when,evidence
  }}).next;
}
describe('M6 — immutable progress projection',()=>{
  it('counts rated success independently of listening and shadowing exposures',()=>{
    const recall=session('recall','recall',{kind:'recall',rating:'good'},1000);
    const failed=session('failed','recall',{kind:'recall',rating:'again'},2000);
    const heard=session('heard','listening',{kind:'exposure',medium:'listening'},3000);
    const repeated=session('spoke','shadowing',{kind:'exposure',medium:'shadowing'},4000);
    const skipped=session('skip','listening',{kind:'skip'},5000);
    const memory=scheduleRatedAttempt(null,recall.session.attempts[0],'cafe')!;
    const data=projectLearningProgress({
      profile,records:[heard,skipped,recall,failed,repeated],states:[memory],
      islands:[island],now:3000+3*86_400_000,recentLimit:4
    });
    expect(data).toMatchObject({
      ratedRecalls:2,successfulRecalls:1,listeningExposures:1,
      shadowingExposures:1,skips:1,sessionsStarted:5,sessionsCompleted:5,
      activeScheduled:1,dueNow:1
    });
    expect(data.recent.map(e=>e.attemptId)).toEqual([
      'skip-attempt','spoke-attempt','heard-attempt','failed-attempt'
    ]);
    expect(data.recent.find(e=>e.kind==='listening')?.rating).toBe(null);
  });
  it('isolates progress from other language profile sessions',()=>{
    const en=session('en1','recall',{kind:'recall',rating:'hard'},1000);
    const jp=session('jp1','listening',{kind:'exposure',medium:'listening'},2000,'user-ja');
    const result=projectLearningProgress({
      profile,records:[jp,en],states:[],islands:[island],now:2000
    });
    expect(result.ratedRecalls).toBe(1);
    expect(result.listeningExposures).toBe(0);
    expect(result.recent).toHaveLength(1);
  });
  it('counts only current catalog revisions as actively scheduled',()=>{
    const old=session('s1','recall',{kind:'recall',rating:'easy'},1000);
    const historic=scheduleRatedAttempt(null,old.session.attempts[0],'cafe')!;
    const modified={...island,sentences:[{...island.sentences[0],revision:2,answer:'A coffee'}]};
    const result=projectLearningProgress({
      profile,records:[old],states:[historic],islands:[modified],now:1e9
    });
    expect(result.ratedRecalls).toBe(1);
    expect(result.activeScheduled).toBe(0);
    expect(result.dueNow).toBe(0);
  });
  it('rejects corrupt stored practice and duplicated global attempt IDs',()=>{
    const first=session('first','recall',{kind:'recall',rating:'hard'},1000);
    const second=session('second','recall',{kind:'recall',rating:'easy'},2000);
    const forged=structuredClone(second);
    (forged.session.attempts[0] as {id:string}).id='first-attempt';
    expect(()=>projectLearningProgress({
      profile,records:[first,forged],states:[],islands:[island],now:2000
    })).toThrow(/Duplicate committed attempt/);
    expect(()=>projectLearningProgress({
      profile,records:[{...first,session:{...first.session,cursor:88}}],
      states:[],islands:[island],now:2000
    })).toThrow();
  });
  it('does not invent practice minutes, speech proficiency or daily streaks',()=>{
    const result=projectLearningProgress({
      profile,records:[],states:[],islands:[],now:0
    });
    expect(result.recent).toEqual([]);
    expect(result.ratedRecalls).toBe(0);
    expect('pronunciationScore' in result).toBe(false);
    expect('minutesLearned' in result).toBe(false);
  });
});
