import {describe,expect,it} from 'vitest';
import {canCommitAudioExposure} from '../../src/lib/modules/language-learning/core/audio-policy.ts';
import {createPracticeSession,commitPracticeAttempt,pauseSession} from '../../src/lib/modules/language-learning/core/learning.ts';
import {practiceAnswerScope} from '../../src/lib/modules/language-learning/core/evaluation.ts';

const island={
  id:'audio-island',revision:1,title:'Speech',sourceLanguage:'id',targetLanguage:'en',
  sentences:[
    {id:'a',revision:1,prompt:'Halo',answer:'Hello'},
    {id:'b',revision:1,prompt:'Terima kasih',answer:'Thank you'}
  ]
};
const session=(mode:'listening'|'shadowing'|'recall')=>
  createPracticeSession({sessionId:'audio-session',profileId:'profile',island,mode});
describe('M6 — audio exposure business eligibility',()=>{
  it('requires completed reference playback for listening',()=>{
    const s=session('listening');
    const scope=practiceAnswerScope(s);
    expect(canCommitAudioExposure({session:s,completedScope:null,shadowingConfirmed:true})).toBe(false);
    expect(canCommitAudioExposure({session:s,completedScope:scope,shadowingConfirmed:false})).toBe(true);
    expect(canCommitAudioExposure({session:null,completedScope:scope,shadowingConfirmed:true})).toBe(false);
  });
  it('requires explicit learner confirmation for shadowing, not a pronunciation score',()=>{
    const s=session('shadowing');
    const scope=practiceAnswerScope(s);
    expect(canCommitAudioExposure({session:s,completedScope:scope,shadowingConfirmed:false})).toBe(false);
    expect(canCommitAudioExposure({session:s,completedScope:scope,shadowingConfirmed:true})).toBe(true);
  });
  it('rejects another sentence, paused session, another session ID and recall mode',()=>{
    const s=session('listening');
    const scope=practiceAnswerScope(s);
    const advanced=commitPracticeAttempt(s,{
      attemptId:'a1',sentenceId:'a',sentenceRevision:1,
      evidence:{kind:'exposure',medium:'listening'},recordedAt:1000
    }).session;
    expect(canCommitAudioExposure({session:advanced,completedScope:scope,
      shadowingConfirmed:true})).toBe(false);
    expect(canCommitAudioExposure({session:pauseSession(s),completedScope:scope,
      shadowingConfirmed:true})).toBe(false);
    const other={...s,id:'other-session'};
    expect(canCommitAudioExposure({session:other,completedScope:scope,
      shadowingConfirmed:true})).toBe(false);
    expect(canCommitAudioExposure({session:session('recall'),
      completedScope:practiceAnswerScope(session('recall')),shadowingConfirmed:true})).toBe(false);
  });
});
