import type { LanguageIsland, Sentence, PracticeSession } from './learning.ts';
import { decodeMemoryState, memoryKey, type MemoryState } from './memory.ts';

const MAX_TIME = 8_640_000_000_000_000;
const MAX_ITEMS = 1000;

/** One personal learning-language profile. Profile IDs are opaque and never inferred from text. */
export interface LearningProfile {
  readonly id: string;
  readonly targetLanguage: string;
}
export type LearningTaskKind = 'relearning' | 'review' | 'new';
export interface LearningTask {
  readonly kind: LearningTaskKind;
  readonly islandId: string;
  readonly sentenceId: string;
  readonly sentenceRevision: number;
  readonly dueAt: number | null;
  readonly priority: number;
}
export interface LearningPlan {
  readonly version: 1;
  readonly profile: LearningProfile;
  readonly generatedAt: number;
  readonly tasks: readonly LearningTask[];
  readonly dueCount: number;
  readonly newCount: number;
  readonly upcomingCount: number;
  readonly excludedOldRevisions: number;
  readonly allCaughtUp: boolean;
}
export interface PlanOptions {
  readonly now: number;
  readonly maxItems?: number;
  readonly maxNew?: number;
}
export class OrchestrationRuleError extends Error {
  constructor(readonly code: 'invalid_catalog' | 'invalid_policy' | 'stale_plan',
    message: string) {
    super(message);
    this.name = 'OrchestrationRuleError';
  }
}
const valid = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const byCodePoint = (a: string,b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Input constraints are also used by the browser repository before opening a transaction. */
export function catalogKeys(profile: LearningProfile, islands: readonly LanguageIsland[]): string[] {
  if (!profile || !valid(profile.id) || !valid(profile.targetLanguage) ||
    !Array.isArray(islands) || islands.length > 100) {
    throw new OrchestrationRuleError('invalid_catalog','Invalid language profile or Island catalog.');
  }
  const keys: string[] = [];
  const seenIslands = new Set<string>();
  for (const island of islands) {
    if (!island || !valid(island.id) || !valid(island.title) ||
      !valid(island.sourceLanguage) || !valid(island.targetLanguage) ||
      island.targetLanguage !== profile.targetLanguage ||
      !integer(island.revision) || island.revision < 1 ||
      !Array.isArray(island.sentences) || !island.sentences.length ||
      seenIslands.has(island.id)) {
      throw new OrchestrationRuleError('invalid_catalog','Island identity or target language is invalid.');
    }
    seenIslands.add(island.id);
    const seenSentences = new Set<string>();
    for (const sentence of island.sentences) {
      if (!sentence || !valid(sentence.id) || !valid(sentence.prompt) ||
        !valid(sentence.answer) || !integer(sentence.revision) ||
        sentence.revision < 1 || seenSentences.has(sentence.id)) {
        throw new OrchestrationRuleError('invalid_catalog','Invalid or repeated sentence in Island.');
      }
      seenSentences.add(sentence.id);
      keys.push(memoryKey({
        profileId:profile.id,islandId:island.id,
        sentenceId:sentence.id,sentenceRevision:sentence.revision
      }));
      if (keys.length > MAX_ITEMS) {
        throw new OrchestrationRuleError('invalid_catalog','Catalog is too large for one planning operation.');
      }
    }
  }
  return keys;
}
/** A/E/R: pure advisory selection, explicit clock, no persisted draft plan or network. */
export function createLearningPlan(input: {
  profile: LearningProfile;
  islands: readonly LanguageIsland[];
  states: readonly MemoryState[];
  options: PlanOptions;
}): LearningPlan {
  const {profile,islands,states,options} = input;
  const keys = catalogKeys(profile,islands);
  const now=options?.now;
  const maxItems=options?.maxItems ?? 10;
  const maxNew=options?.maxNew ?? 3;
  if (!integer(now) || now < 0 || now > MAX_TIME ||
    !integer(maxItems) || maxItems < 1 || maxItems > 50 ||
    !integer(maxNew) || maxNew < 0 || maxNew > maxItems ||
    !Array.isArray(states)) {
    throw new OrchestrationRuleError('invalid_policy','Invalid planning clock, limit or review state input.');
  }
  const active=new Set(keys);
  const statesByKey=new Map<string,MemoryState>();
  let excludedOldRevisions=0;
  for (const raw of states) {
    const state=decodeMemoryState(raw);
    if (state.profileId !== profile.id) {
      throw new OrchestrationRuleError('invalid_catalog','Memory state belongs to another language profile.');
    }
    if (statesByKey.has(state.key)) {
      throw new OrchestrationRuleError('invalid_catalog','Duplicate memory state supplied.');
    }
    statesByKey.set(state.key,state);
    if (!active.has(state.key)) excludedOldRevisions++;
  }
  const due:LearningTask[]=[];
  const fresh:LearningTask[]=[];
  let upcomingCount=0;
  for(const island of islands) for(const sentence of island.sentences) {
    const key=memoryKey({
      profileId:profile.id,islandId:island.id,
      sentenceId:sentence.id,sentenceRevision:sentence.revision
    });
    const state=statesByKey.get(key);
    if (!state) {
      fresh.push({kind:'new',islandId:island.id,sentenceId:sentence.id,
        sentenceRevision:sentence.revision,dueAt:null,priority:2});
    } else if (state.dueAt <= now) {
      const relearning=state.stage !== 'review';
      due.push({kind:relearning?'relearning':'review',islandId:island.id,
        sentenceId:sentence.id,sentenceRevision:sentence.revision,
        dueAt:state.dueAt,priority:relearning?0:1});
    } else upcomingCount++;
  }
  due.sort((a,b)=>a.priority-b.priority ||
    (a.dueAt ?? 0)-(b.dueAt ?? 0) ||
    byCodePoint(a.islandId,b.islandId) ||
    byCodePoint(a.sentenceId,b.sentenceId));
  const tasks=[
    ...due.slice(0,maxItems),
    ...fresh.slice(0,Math.min(maxNew,Math.max(0,maxItems-due.length)))
  ];
  return {
    version:1,profile:{id:profile.id,targetLanguage:profile.targetLanguage},
    generatedAt:now,tasks,dueCount:due.length,newCount:fresh.length,
    upcomingCount,excludedOldRevisions,
    allCaughtUp:due.length===0 && fresh.length===0
  };
}
/** M0 owns one Island per session. Turn the recommended head into one targeted Island batch. */
export function recommendedIsland(plan: LearningPlan, islands: readonly LanguageIsland[]): LanguageIsland | null {
  const first=plan.tasks[0];
  if (!first) return null;
  const island=islands.find(i=>i.id===first.islandId);
  if (!island || island.targetLanguage!==plan.profile.targetLanguage) {
    throw new OrchestrationRuleError('stale_plan','Recommendation references an unavailable Island.');
  }
  const selected:Sentence[]=[];
  for(const task of plan.tasks) {
    if(task.islandId!==first.islandId)continue;
    const sentence=island.sentences.find(s=>s.id===task.sentenceId &&
      s.revision===task.sentenceRevision);
    if (!sentence) throw new OrchestrationRuleError('stale_plan','Recommended sentence was edited.');
    selected.push(sentence);
  }
  if (!selected.length) throw new OrchestrationRuleError('stale_plan','Recommendation is empty.');
  return {...island,sentences:selected};
}
