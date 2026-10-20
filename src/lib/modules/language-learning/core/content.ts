import type { LanguageIsland, Sentence } from './learning.ts';
import type { LearningProfile } from './orchestration.ts';

export interface VocabularyEntry {
  readonly id: string;
  readonly sentenceId: string;
  readonly sentenceRevision: number;
  readonly term: string;
  readonly meaning: string;
}
export interface ContentIsland {
  readonly profileId: string;
  readonly island: LanguageIsland;
  readonly vocabulary: readonly VocabularyEntry[];
  readonly archived: boolean;
}
export interface IslandDraft {
  readonly id: string;
  readonly title: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly sentences: readonly {id: string; prompt: string; answer: string}[];
  readonly vocabulary: readonly {id: string; sentenceId: string; term: string; meaning: string}[];
}
export class ContentRuleError extends Error {
  constructor(readonly code: 'invalid' | 'conflict', message: string) {
    super(message);
    this.name = 'ContentRuleError';
  }
}
const text = (v: unknown, limit=2000): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= limit;
const fail = (message: string): never => {throw new ContentRuleError('invalid',message);};
const whole = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number)>0;

export function decodeLearningProfile(raw: unknown): LearningProfile {
  if(!raw || typeof raw!=='object' || Array.isArray(raw))return fail('Invalid language profile.');
  const p=raw as Record<string,unknown>;
  if(!text(p.id,128) || !text(p.targetLanguage,32))return fail('Invalid language profile identity.');
  return {id:p.id,targetLanguage:p.targetLanguage};
}
export function validateContentIsland(raw: unknown, expectedProfile?: LearningProfile): ContentIsland {
  if(!raw || typeof raw!=='object' || Array.isArray(raw))return fail('Invalid Island record.');
  const row=raw as Record<string,unknown>;
  if(!text(row.profileId,128) || !row.island || typeof row.island!=='object' ||
    !Array.isArray(row.vocabulary) || typeof row.archived!=='boolean')return fail('Invalid Island envelope.');
  const island=row.island as Record<string,unknown>;
  if(!text(island.id,128) || !text(island.title,200) ||
    !text(island.sourceLanguage,32) || !text(island.targetLanguage,32) ||
    !whole(island.revision) || !Array.isArray(island.sentences) ||
    !island.sentences.length || island.sentences.length>500 ||
    (expectedProfile && (expectedProfile.id!==row.profileId ||
      expectedProfile.targetLanguage!==island.targetLanguage))) return fail('Invalid Island metadata.');
  const seenSentences=new Set<string>();
  for(const rawSentence of island.sentences) {
    if(!rawSentence || typeof rawSentence!=='object')return fail('Invalid sentence.');
    const s=rawSentence as Record<string,unknown>;
    if(!text(s.id,128)||!text(s.prompt)||!text(s.answer)||!whole(s.revision)||
      seenSentences.has(s.id))return fail('Invalid or repeated sentence.');
    seenSentences.add(s.id);
  }
  if(row.vocabulary.length>2000)return fail('Too many vocabulary entries.');
  const ids=new Set<string>();
  const sentences=island.sentences as Sentence[];
  for(const rawV of row.vocabulary) {
    if(!rawV||typeof rawV!=='object')return fail('Invalid vocabulary.');
    const v=rawV as Record<string,unknown>;
    const source=sentences.find(s=>s.id===v.sentenceId);
    if(!text(v.id,128)||!text(v.term,300)||!text(v.meaning,1000)||
      !source || v.sentenceRevision!==source.revision || ids.has(v.id))
      return fail('Vocabulary must reference a current sentence revision.');
    ids.add(v.id);
  }
  return raw as ContentIsland;
}
/** Revision changes only when prompt/answer changes; cosmetic Island edits preserve
 * SRS sentence identity. Removed sentences are omitted from the current catalog,
 * never from historical session snapshots or stored review evidence. */
export function reviseIsland(previous: ContentIsland | null, profile: LearningProfile,
  draft: IslandDraft, archived=false): ContentIsland {
  decodeLearningProfile(profile);
  if(!draft || !text(draft.id,128) || !text(draft.title,200) ||
    !text(draft.sourceLanguage,32) || !text(draft.targetLanguage,32) ||
    profile.targetLanguage!==draft.targetLanguage ||
    !Array.isArray(draft.sentences) || !draft.sentences.length ||
    draft.sentences.length>500 || !Array.isArray(draft.vocabulary) ||
    draft.vocabulary.length>2000)return fail('Invalid Island content.');
  if(previous){
    validateContentIsland(previous,profile);
    if(previous.island.id!==draft.id ||
      previous.island.sourceLanguage!==draft.sourceLanguage ||
      previous.island.targetLanguage!==draft.targetLanguage)
      throw new ContentRuleError('conflict','Island identity and language cannot change during edit.');
  }
  const old=new Map(previous?.island.sentences.map(s=>[s.id,s]) ?? []);
  const used=new Set<string>();
  const sentences:Sentence[]=draft.sentences.map(s=>{
    if(!s || !text(s.id,128)||!text(s.prompt)||!text(s.answer)||used.has(s.id))return fail('Invalid or repeated sentence.');
    used.add(s.id);
    const prior=old.get(s.id);
    return {id:s.id,prompt:s.prompt,answer:s.answer,
      revision:prior ? (prior.prompt===s.prompt && prior.answer===s.answer ? prior.revision : prior.revision+1) : 1};
  });
  const byId=new Map(sentences.map(s=>[s.id,s]));
  const vocabSeen=new Set<string>();
  const vocabulary:VocabularyEntry[]=draft.vocabulary.map(v=>{
    if(!v || !text(v.id,128)||!text(v.term,300)||!text(v.meaning,1000) ||
      vocabSeen.has(v.id))return fail('Invalid or repeated vocabulary.');
    const source=byId.get(v.sentenceId);
    if(!source)return fail('Vocabulary must reference an existing sentence.');
    vocabSeen.add(v.id);
    return {id:v.id,sentenceId:source.id,sentenceRevision:source.revision,term:v.term,meaning:v.meaning};
  });
  const result:ContentIsland={
    profileId:profile.id, archived,
    island:{id:draft.id,revision:(previous?.island.revision ?? 0)+1,title:draft.title,
      sourceLanguage:draft.sourceLanguage,targetLanguage:draft.targetLanguage,sentences},
    vocabulary
  };
  return validateContentIsland(result,profile);
}
export function archiveIsland(current:ContentIsland, archived:boolean):ContentIsland {
  validateContentIsland(current);
  if(typeof archived!=='boolean')return fail('Invalid archive status.');
  if(current.archived===archived)return current;
  return {...current,archived,island:{...current.island,revision:current.island.revision+1}};
}
export function draftFromIsland(current:ContentIsland):IslandDraft {
  validateContentIsland(current);
  return {...current.island,
    sentences:current.island.sentences.map(({id,prompt,answer})=>({id,prompt,answer})),
    vocabulary:current.vocabulary.map(({id,sentenceId,term,meaning})=>({id,sentenceId,term,meaning}))};
}
