import { describe, expect, it } from 'vitest';
import {
  assessRecallRating, assessmentForAttempt, checkRecallAnswer,
  isValidRecallAssessment, practiceAnswerScope, recallFeedback
} from '../../src/lib/modules/language-learning/core/evaluation.ts';
import {
  applyPracticeCommand, decodePracticeCommand, decodeStoredPractice,
  PracticeStorageRuleError
} from '../../src/lib/modules/language-learning/core/persistence.ts';
import {
  isMemoryEligible, isSuccessfulRecall,
  type PracticeAttempt, type LanguageIsland
} from '../../src/lib/modules/language-learning/core/learning.ts';

const island: LanguageIsland = {
  id: 'starter', revision: 1, title: 'Starter', sourceLanguage: 'id',
  targetLanguage: 'en', sentences: [
    { id: 'one', revision: 1, prompt: 'Halo!', answer: 'Hello!' }
  ]
};
const start = { type: 'start' as const, sessionId: 'session-m2',
  profileId: 'english', mode: 'recall' as const, island };
const command = (rating: 'again'|'hard'|'good'|'easy', attemptId = 'a1') => ({
  type: 'attempt' as const, sessionId: start.sessionId, attempt: {
    attemptId, sentenceId: 'one', sentenceRevision: 1, recordedAt: 123,
    evidence: { kind: 'recall' as const, rating }
  }
});
describe('Language Learning M2 — Recall Evaluation', () => {
  it.each([
    ['again','forgot',null,false],
    ['hard','recalled','high',true],
    ['good','recalled','normal',true],
    ['easy','recalled','low',true]
  ] as const)('%s creates consistent self-report metadata', (rating,outcome,effort,success) => {
    const assessment = assessRecallRating(rating);
    expect(assessment).toEqual({version:1,source:'self_rating',outcome,effort});
    expect(isValidRecallAssessment(assessment,rating)).toBe(true);
    expect(recallFeedback(rating).length).toBeGreaterThan(5);
    let s = applyPracticeCommand(null,start).next;
    s = applyPracticeCommand(s,{type:'reveal',sessionId:start.sessionId}).next;
    s = applyPracticeCommand(s,command(rating)).next;
    const attempt = s.session.attempts[0];
    expect(assessmentForAttempt(attempt)).toEqual(assessment);
    expect(isSuccessfulRecall(attempt)).toBe(success);
    expect(isMemoryEligible(attempt)).toBe(true);
    expect(decodeStoredPractice(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('accepts legacy M1 rated evidence without assessment while retaining semantics', () => {
    const old: PracticeAttempt = {
      id:'legacy',sessionId:'s',profileId:'en',sentenceId:'one',
      sentenceRevision:1,recordedAt:1,evidence:{kind:'recall',rating:'hard'}
    };
    expect(assessmentForAttempt(old)).toEqual(assessRecallRating('hard'));
    expect(isSuccessfulRecall(old)).toBe(true);
  });
  it('does not turn exposure or skip into recall evaluation', () => {
    const base = {id:'x',sessionId:'s',profileId:'en',sentenceId:'one',sentenceRevision:1,recordedAt:1};
    const exposure: PracticeAttempt = {...base,evidence:{kind:'exposure',medium:'listening'}};
    const skipped: PracticeAttempt = {...base,id:'y',evidence:{kind:'skip'}};
    expect(assessmentForAttempt(exposure)).toBe(null);
    expect(assessmentForAttempt(skipped)).toBe(null);
    expect(isMemoryEligible(exposure)).toBe(false);
    expect(isSuccessfulRecall(skipped)).toBe(false);
  });
  it('strict literal comparison distinguishes verified variant from potentially valid wording', () => {
    expect(checkRecallAnswer({response:' Hello! ',reference:'Hello!'}).status)
      .toBe('reference_match');
    expect(checkRecallAnswer({
      response:"I'd like a coffee.",reference:'I would like a coffee.',
      acceptedVariants:["I'd like a coffee."]
    }).status).toBe('variant_match');
    expect(checkRecallAnswer({
      response:'Hello?',reference:'Hello!'
    }).status).toBe('needs_review');
    expect(checkRecallAnswer({
      response:'',reference:'Hello!'
    }).status).toBe('empty');
  });
  it('does not erase semantic punctuation or case in open-ended language answers', () => {
    expect(checkRecallAnswer({response:'Hello',reference:'hello'}).status)
      .toBe('needs_review');
    expect(checkRecallAnswer({response:'Hello?',reference:'Hello.'}).status)
      .toBe('needs_review');
    expect(checkRecallAnswer({response:'Hello.',reference:'Hello'}).status)
      .toBe('reference_match');
    expect(checkRecallAnswer({response:'x'.repeat(2001),reference:'Hello'}).status)
      .toBe('needs_review');
  });
  it('does not throw when long M0/M1 sentence is valid but exceeds comparison limit', () => {
    const longIsland = {...island, sentences:[
      {id:'long',revision:1,prompt:'Translate',answer:'A'.repeat(2500)}
    ]};
    const session = applyPracticeCommand(null,{...start,island:longIsland}).next;
    const revealed = applyPracticeCommand(session,{
      type:'reveal',sessionId:start.sessionId
    }).next;
    expect(decodeStoredPractice(revealed)).toEqual(revealed);
    const feedback = checkRecallAnswer({
      response:'Short response',reference:revealed.session.items[0].answer
    });
    expect(feedback.status).toBe('needs_review');
    expect(feedback.feedback).toContain('manually');
  });
  it('keeps answer identity through reveal/pause and changes it for a new session or question', () => {
    const twoSentenceIsland = {...island, sentences:[
      ...island.sentences,
      {id:'two',revision:1,prompt:'Terima kasih',answer:'Thank you'}
    ]};
    const first = applyPracticeCommand(null,{...start,island:twoSentenceIsland}).next;
    const scope = practiceAnswerScope(first.session);
    expect(scope).not.toBe(null);
    const revealed = applyPracticeCommand(first,{
      type:'reveal',sessionId:start.sessionId
    }).next;
    expect(practiceAnswerScope(revealed.session)).toBe(scope);
    const paused = applyPracticeCommand(revealed,{
      type:'pause',sessionId:start.sessionId
    }).next;
    expect(practiceAnswerScope(paused.session)).toBe(scope);
    const afterRating = applyPracticeCommand(
      applyPracticeCommand(paused,{type:'resume',sessionId:start.sessionId}).next,
      command('good')
    ).next;
    expect(practiceAnswerScope(afterRating.session)).not.toBe(scope);
    const second = applyPracticeCommand(null,{
      ...start,sessionId:'session-m2-b',island:twoSentenceIsland
    }).next;
    expect(practiceAnswerScope(second.session)).not.toBe(scope);
    const abandoned = applyPracticeCommand(second,{
      type:'abandon',sessionId:'session-m2-b'
    }).next;
    expect(practiceAnswerScope(abandoned.session)).toBe(null);
  });
  it('rejects tampered durable assessment and permits legacy absent metadata', () => {
    let s = applyPracticeCommand(null,start).next;
    s = applyPracticeCommand(s,{type:'reveal',sessionId:start.sessionId}).next;
    s = applyPracticeCommand(s,command('again')).next;
    const forged = structuredClone(s);
    const evidence = forged.session.attempts[0].evidence;
    if(evidence.kind!=='recall') throw Error('expected recall');
    (evidence as {assessment:unknown}).assessment = {
      version:1,source:'self_rating',outcome:'recalled',effort:'low'
    };
    expect(() => decodeStoredPractice(forged)).toThrowError(PracticeStorageRuleError);
    const old = structuredClone(s);
    const e = old.session.attempts[0].evidence;
    if(e.kind!=='recall') throw Error('expected recall');
    delete (e as {assessment?:unknown}).assessment;
    expect(decodeStoredPractice(old)).toEqual(old);
  });
  it('reconstructs assessment server-side, ignoring injected client metadata', () => {
    const raw = command('again');
    const inflated = {...raw,attempt:{...raw.attempt,evidence:{
      kind:'recall',rating:'again',
      assessment:{version:1,source:'self_rating',outcome:'recalled',effort:'low'}
    }}};
    const decoded=decodePracticeCommand(inflated);
    expect(decoded.type).toBe('attempt');
    if(decoded.type!=='attempt')throw Error('expected attempt');
    expect(decoded.attempt.evidence).toEqual({kind:'recall',rating:'again'});
    let state=applyPracticeCommand(null,start).next;
    state=applyPracticeCommand(state,{type:'reveal',sessionId:start.sessionId}).next;
    const saved=applyPracticeCommand(state,decoded).next.session.attempts[0];
    expect(assessmentForAttempt(saved)?.outcome).toBe('forgot');
  });
  it('duplicate attempt IDs cannot rewrite rating or its derived assessment', () => {
    let state=applyPracticeCommand(null,start).next;
    state=applyPracticeCommand(state,{type:'reveal',sessionId:start.sessionId}).next;
    const once=applyPracticeCommand(state,command('hard')).next;
    const replay=applyPracticeCommand(once,command('hard'));
    expect(replay.changed).toBe(false);
    expect(replay.next).toBe(once);
    expect(() => applyPracticeCommand(once,command('easy'))).toThrowError();
  });
});
