import {describe, expect, it} from 'vitest';
import {
  archiveIsland, decodeLearningProfile, draftFromIsland,
  reviseIsland, validateContentIsland, type IslandDraft
} from '../../src/lib/modules/language-learning/core/content.ts';

const profile={id:'learner-en',targetLanguage:'en'};
const draft: IslandDraft={
  id:'cafe', title:'At the café',sourceLanguage:'id',targetLanguage:'en',
  sentences:[
    {id:'coffee',prompt:'Kopi',answer:'Coffee'},
    {id:'tea',prompt:'Teh',answer:'Tea'}
  ],
  vocabulary:[{id:'word-coffee',sentenceId:'coffee',term:'kopi',meaning:'coffee'}]
};
describe('M5 — authored content and vocabulary rules',()=>{
  it('creates validated content with stable sentence and vocabulary references',()=>{
    const record=reviseIsland(null,profile,draft);
    expect(record.island.revision).toBe(1);
    expect(record.island.sentences.map(s=>s.revision)).toEqual([1,1]);
    expect(record.vocabulary).toEqual([{
      id:'word-coffee',sentenceId:'coffee',sentenceRevision:1,term:'kopi',meaning:'coffee'
    }]);
    expect(validateContentIsland(structuredClone(record),profile)).toEqual(record);
    expect(draftFromIsland(record).vocabulary).toEqual(draft.vocabulary);
  });
  it('increments only the edited sentence revision; title/vocabulary changes do not reset SRS',()=>{
    const original=reviseIsland(null,profile,draft);
    const renamed=reviseIsland(original,profile,{...draft,title:'Coffee shop',
      vocabulary:[{...draft.vocabulary[0],meaning:'coffee drink'}]});
    expect(renamed.island.revision).toBe(2);
    expect(renamed.island.sentences.map(s=>s.revision)).toEqual([1,1]);
    const rewritten=reviseIsland(renamed,profile,{
      ...draft,sentences:[
        {...draft.sentences[0],answer:'A cup of coffee'},
        draft.sentences[1]
      ]
    });
    expect(rewritten.island.sentences.map(s=>s.revision)).toEqual([2,1]);
    expect(rewritten.vocabulary[0].sentenceRevision).toBe(2);
  });
  it('retains archived content while preserving its historical revisions',()=>{
    const original=reviseIsland(null,profile,draft);
    const archived=archiveIsland(original,true);
    expect(archived.archived).toBe(true);
    expect(archived.island.revision).toBe(2);
    expect(archived.island.sentences).toEqual(original.island.sentences);
    expect(archiveIsland(archived,true)).toBe(archived);
    expect(archiveIsland(archived,false).archived).toBe(false);
  });
  it('rejects invalid vocabulary references, duplicate IDs, mixed languages and identity rewrites',()=>{
    expect(()=>reviseIsland(null,profile,{...draft,vocabulary:[
      {...draft.vocabulary[0],sentenceId:'unknown'}
    ]})).toThrow();
    expect(()=>reviseIsland(null,profile,{...draft,sentences:[
      draft.sentences[0],draft.sentences[0]
    ]})).toThrow();
    expect(()=>reviseIsland(null,profile,{...draft,targetLanguage:'ja'})).toThrow();
    const previous=reviseIsland(null,profile,draft);
    expect(()=>reviseIsland(previous,profile,{...draft,id:'different'})).toThrow();
    expect(()=>validateContentIsland({...previous,vocabulary:[{
      ...previous.vocabulary[0],sentenceRevision:99
    }]})).toThrow();
  });
  it('rejects hostile profile schemas and too-long content without lossy truncation',()=>{
    expect(()=>decodeLearningProfile({id:'',targetLanguage:'en'})).toThrow();
    expect(()=>reviseIsland(null,profile,{...draft,sentences:[
      {...draft.sentences[0],answer:'x'.repeat(2001)}
    ]})).toThrow();
    expect(()=>reviseIsland(null,profile,{...draft,vocabulary:[
      {...draft.vocabulary[0],meaning:'x'.repeat(1001)}
    ]})).toThrow();
  });
});
