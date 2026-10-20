import type { LanguageIsland, PracticeAttempt } from './learning.ts';
import type { StoredPractice } from './persistence.ts';
import { decodeStoredPractice } from './persistence.ts';
import { decodeMemoryState, memoryKey, type MemoryState } from './memory.ts';
import type { LearningProfile } from './orchestration.ts';

export interface ActivityItem {
  readonly attemptId: string;
  readonly sessionId: string;
  readonly islandId: string;
  readonly sentenceId: string;
  readonly prompt: string;
  readonly recordedAt: number;
  readonly kind: 'recall' | 'listening' | 'shadowing' | 'skip';
  readonly rating: 'again' | 'hard' | 'good' | 'easy' | null;
}
export interface LearningProgress {
  readonly version: 1;
  readonly profileId: string;
  readonly asOf: number;
  readonly sessionsStarted: number;
  readonly sessionsCompleted: number;
  readonly ratedRecalls: number;
  readonly successfulRecalls: number;
  readonly listeningExposures: number;
  readonly shadowingExposures: number;
  readonly skips: number;
  readonly activeScheduled: number;
  readonly dueNow: number;
  readonly recent: readonly ActivityItem[];
}
export class ProgressRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProgressRuleError';
  }
}
const codepoint = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const MAX_TIME = 8_640_000_000_000_000;

/** Authoritative projection: counters and timeline come from committed attempts,
 * not events inferred from audio playback or a second mutable stats table. */
export function projectLearningProgress(input: {
  profile: LearningProfile;
  records: readonly StoredPractice[];
  states: readonly MemoryState[];
  islands: readonly LanguageIsland[];
  now: number;
  recentLimit?: number;
}): LearningProgress {
  const {profile, records,states,islands,now} = input;
  const recentLimit=input.recentLimit ?? 15;
  if(!profile || !profile.id?.trim() || !profile.targetLanguage?.trim() ||
    !Number.isSafeInteger(now) || now<0 || now>MAX_TIME ||
    !Number.isSafeInteger(recentLimit) || recentLimit<1 || recentLimit>100 ||
    !Array.isArray(records) || !Array.isArray(states) || !Array.isArray(islands)) {
    throw new ProgressRuleError('Invalid progress profile, clock or timeline limit.');
  }
  let sessionsStarted=0,sessionsCompleted=0,ratedRecalls=0,successfulRecalls=0;
  let listeningExposures=0,shadowingExposures=0,skips=0;
  const events:ActivityItem[]=[];
  const seenAttempts=new Set<string>();
  for(const raw of records){
    const record=decodeStoredPractice(raw);
    const session=record.session;
    if(session.profileId!==profile.id)continue;
    sessionsStarted++;
    if(session.status==='completed')sessionsCompleted++;
    for(let i=0;i<session.attempts.length;i++){
      const attempt:PracticeAttempt=session.attempts[i];
      if(seenAttempts.has(attempt.id))
        throw new ProgressRuleError('Duplicate committed attempt ID in history.');
      seenAttempts.add(attempt.id);
      const kind=attempt.evidence.kind==='exposure'
        ? attempt.evidence.medium : attempt.evidence.kind;
      if(kind==='recall'){
        ratedRecalls++;
        if(attempt.evidence.kind==='recall' && attempt.evidence.rating!=='again')successfulRecalls++;
      }else if(kind==='listening')listeningExposures++;
      else if(kind==='shadowing')shadowingExposures++;
      else skips++;
      events.push({
        attemptId:attempt.id,sessionId:session.id,islandId:session.islandId,
        sentenceId:attempt.sentenceId,prompt:session.items[i].prompt,
        recordedAt:attempt.recordedAt,kind,
        rating:attempt.evidence.kind==='recall'?attempt.evidence.rating:null
      });
    }
  }
  const active=new Set<string>();
  for(const island of islands) {
    if(island.targetLanguage!==profile.targetLanguage)
      throw new ProgressRuleError('Active Island target language mismatch.');
    for(const sentence of island.sentences) active.add(memoryKey({
      profileId:profile.id,islandId:island.id,
      sentenceId:sentence.id,sentenceRevision:sentence.revision
    }));
  }
  let activeScheduled=0,dueNow=0;
  const seenStates=new Set<string>();
  for(const raw of states) {
    const state=decodeMemoryState(raw);
    if(state.profileId!==profile.id)throw new ProgressRuleError('Review state profile mismatch.');
    if(seenStates.has(state.key))throw new ProgressRuleError('Duplicate review state.');
    seenStates.add(state.key);
    if(!active.has(state.key))continue; // archived or edited content is not current
    activeScheduled++;
    if(state.dueAt<=now)dueNow++;
  }
  events.sort((a,b)=>b.recordedAt-a.recordedAt ||
    codepoint(a.attemptId,b.attemptId));
  return {
    version:1,profileId:profile.id,asOf:now,
    sessionsStarted,sessionsCompleted,ratedRecalls,successfulRecalls,
    listeningExposures,shadowingExposures,skips,activeScheduled,dueNow,
    recent:events.slice(0,recentLimit)
  };
}
