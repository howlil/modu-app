import { describe, expect, it } from 'vitest';
import {
  applyPracticeCommand, decodePracticeCommand, decodeStoredPractice,
  PracticeStorageRuleError, type PracticeCommand
} from '../../src/lib/modules/language-learning/core/persistence.ts';
import type { LanguageIsland } from '../../src/lib/modules/language-learning/core/learning.ts';
const island: LanguageIsland = {
  id: 'island-one', revision: 1, title: 'Greetings',
  sourceLanguage: 'id', targetLanguage: 'en',
  sentences: [
    {id:'one',revision:1,prompt:'Halo',answer:'Hello'},
    {id:'two',revision:1,prompt:'Terima kasih',answer:'Thank you'}
  ]
};
const start: PracticeCommand = {
  type:'start',sessionId:'session-one',profileId:'language-en',mode:'recall',island
};
describe('Language Learning M1 — persisted business contracts', () => {
  it('creates a versioned record and can decode its JSON after reload', () => {
    const {next} = applyPracticeCommand(null, start);
    expect(next.revision).toBe(1);
    expect(decodeStoredPractice(JSON.parse(JSON.stringify(next)))).toEqual(next);
  });
  it('keeps original session for an identical start retry, including after progress', () => {
    const first = applyPracticeCommand(null,start).next;
    const revealed = applyPracticeCommand(first,{type:'reveal',sessionId:'session-one'}).next;
    const retry = applyPracticeCommand(revealed,start);
    expect(retry.changed).toBe(false);
    expect(retry.next).toBe(revealed);
    expect(() => applyPracticeCommand(revealed,{...start, island:{
      ...island, sentences:[{...island.sentences[0],answer:'Changed!'},island.sentences[1]]
    }})).toThrowError(PracticeStorageRuleError);
  });
  it('reveal, commit, and duplicate attempt do not advance twice', () => {
    let state = applyPracticeCommand(null,start).next;
    state = applyPracticeCommand(state,{type:'reveal',sessionId:'session-one'}).next;
    const cmd:PracticeCommand = {type:'attempt',sessionId:'session-one',attempt:{
      attemptId:'first-attempt',sentenceId:'one',sentenceRevision:1,
      evidence:{kind:'recall',rating:'good'},recordedAt:1000
    }};
    const first=applyPracticeCommand(state,cmd);
    expect(first.next.revision).toBe(3);
    expect(first.attempt?.evidence).toEqual({kind:'recall',rating:'good'});
    const retry=applyPracticeCommand(first.next,cmd);
    expect(retry.changed).toBe(false);
    expect(retry.attempt).toBe(null);
    expect(retry.next.session.attempts).toHaveLength(1);
  });
  it('does not turn skip or exposure into rated recall', () => {
    const listening = applyPracticeCommand(null,{...start, mode:'listening'}).next;
    const next=applyPracticeCommand(listening,{type:'attempt',sessionId:'session-one',attempt:{
      attemptId:'listen',sentenceId:'one',sentenceRevision:1,
      evidence:{kind:'exposure',medium:'listening'},recordedAt:1
    }}).next;
    expect(next.session.attempts[0].evidence).toEqual({kind:'exposure',medium:'listening'});
    const skipped=applyPracticeCommand(next,{type:'attempt',sessionId:'session-one',attempt:{
      attemptId:'skip',sentenceId:'two',sentenceRevision:1,evidence:{kind:'skip'},recordedAt:2
    }}).next;
    expect(skipped.session.status).toBe('completed');
    expect(decodeStoredPractice(skipped).session.attempts).toHaveLength(2);
  });
  it('rejects corrupt disk records instead of resetting them', () => {
    const record = applyPracticeCommand(null,start).next;
    const broken = structuredClone(record);
    (broken.session as {cursor:number}).cursor = 99;
    expect(() => decodeStoredPractice(broken)).toThrowError(PracticeStorageRuleError);
    expect(() => decodeStoredPractice({schemaVersion:2,revision:0,session:record.session})).toThrowError();
    const revised = structuredClone(record);
    revised.session.items[0].answer = '';
    expect(() => decodeStoredPractice(revised)).toThrowError();
  });
  it('rejects untrusted commands with invalid evidence', () => {
    expect(() => decodePracticeCommand({
      type:'attempt',sessionId:'session-one',attempt:{
        attemptId:'a',sentenceId:'one',sentenceRevision:1,
        evidence:{kind:'recall',rating:'perfect'},recordedAt:1
      }
    })).toThrowError(PracticeStorageRuleError);
  });
});
