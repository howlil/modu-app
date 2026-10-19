import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
import { openLanguageLearningStorage } from './language-learning-storage.ts';
import { PracticeStorageRuleError } from '../src/lib/modules/language-learning/core/persistence.ts';
import type { PracticeCommand } from '../src/lib/modules/language-learning/core/persistence.ts';

const folder = mkdtempSync(join(tmpdir(), 'modu-language-storage-'));
const path = join(folder, 'history.sqlite');
const create = (sessionId: string): PracticeCommand => ({
  type: 'start', sessionId, profileId:'english',
  mode:'recall', island:{
    id:'starter',revision:1,title:'Starter',sourceLanguage:'id',targetLanguage:'en',
    sentences:[{id:'s1',revision:1,prompt:'Halo',answer:'Hello'}]
  }
});
const rated = (sessionId: string, attemptId:string): PracticeCommand => ({
  type:'attempt',sessionId,attempt:{
    attemptId, sentenceId:'s1',sentenceRevision:1,
    evidence:{kind:'recall',rating:'good'}, recordedAt:1700000000000
  }
});
function conflict(fn:()=>unknown) {
  assert.throws(fn,(err:unknown)=>err instanceof PracticeStorageRuleError && err.code==='conflict');
}
try {
  let db = openLanguageLearningStorage(path);
  let first = db.execute(create('a'),null);
  assert.equal(first.revision,1);
  assert.equal(db.latest()?.session.id,'a');
  const second = db.execute({type:'reveal',sessionId:'a'},first.revision);
  assert.equal(second.session.phase,'revealed');
  conflict(()=>db.execute({type:'pause',sessionId:'a'},first.revision)); // stale competing tab
  const third=db.execute(rated('a','attempt-a'),second.revision);
  assert.equal(third.session.status,'completed');
  assert.deepEqual(third.session.attempts[0].evidence, {
    kind:'recall',rating:'good',assessment:{
      version:1,source:'self_rating',outcome:'recalled',effort:'normal'
    }
  });
  assert.equal(db.attemptCount(),1);
  assert.deepEqual(db.execute(rated('a','attempt-a'),second.revision),third); // lost response replay
  assert.equal(db.attemptCount(),1);
  db.close();
  db=openLanguageLearningStorage(path);
  assert.equal(db.latest()?.session.attempts[0].id,'attempt-a'); // restart recovery
  const afterRestart=db.latest()?.session.attempts[0].evidence;
  assert.equal(afterRestart?.kind,'recall');
  if(afterRestart?.kind==='recall')assert.equal(afterRestart.assessment?.outcome,'recalled');
  assert.equal(db.attemptCount(),1);
  first=db.execute(create('b'),null);
  db.execute({type:'reveal',sessionId:'b'},first.revision);
  conflict(()=>db.execute(rated('b','attempt-a'),first.revision+1)); // global unique attempt identity
  assert.equal(db.get('b')?.session.cursor,0); // rollback: not partially committed
  assert.equal(db.attemptCount(),1);
  db.close();
  console.log('Language Learning SQLite integration: PASS (restart, atomic commit, stale revision, replay, rollback)');
} finally {
  rmSync(folder,{recursive:true,force:true});
}
