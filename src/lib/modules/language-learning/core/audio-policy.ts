import type {PracticeSession} from './learning.ts';
import {practiceAnswerScope} from './evaluation.ts';

/** UI evidence gate: the browser cannot objectively verify that a learner heard
 * or correctly pronounced audio. A completed playback and learner confirmation
 * only allow an exposure, never a rated recall or SRS update. */
export function canCommitAudioExposure(input:{
  session:PracticeSession|null;
  completedScope:string|null;
  shadowingConfirmed:boolean;
}):boolean {
  const {session,completedScope,shadowingConfirmed}=input;
  if(!session || session.status!=='active' || session.mode==='recall' ||
    !completedScope || completedScope!==practiceAnswerScope(session))return false;
  return session.mode==='listening' || (session.mode==='shadowing' && shadowingConfirmed);
}
