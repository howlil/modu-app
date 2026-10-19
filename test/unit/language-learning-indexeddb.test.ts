import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { learningPersistence, LearningPersistenceError } from '../../src/lib/modules/language-learning/adapters/persistence.ts';
import { applyPracticeCommand, type PracticeCommand } from '../../src/lib/modules/language-learning/core/persistence.ts';

const makeStart = (sessionId: string, profileId = 'en'): PracticeCommand => ({
  type: 'start', sessionId, profileId, mode: 'recall',
  island: {id:'cafe',revision:1,title:'Café',sourceLanguage:'id',targetLanguage:profileId,
    sentences:[{id:'coffee',revision:1,prompt: profileId === 'ja' ? 'お茶をください' : 'Kopi',answer:'Coffee'}]}
});
const attempt = (sessionId: string, id: string, rating: 'again'|'hard'|'good'|'easy' = 'good'): PracticeCommand => ({
  type:'attempt', sessionId, attempt:{
    attemptId:id,sentenceId:'coffee',sentenceRevision:1,
    evidence:{kind:'recall',rating},recordedAt:1000
  }
});
const reveal = (sessionId: string): PracticeCommand => ({type:'reveal',sessionId});
const deleteDatabase = () => new Promise<void>((resolve,reject)=>{
  const req = indexedDB.deleteDatabase('modu-language-learning');
  req.onsuccess = () => resolve();
  req.onerror = () => reject(req.error);
  req.onblocked = () => reject(new Error('Database connection leaked between tests.'));
});
beforeEach(deleteDatabase);
describe('Language Learning — IndexedDB M1 repository', () => {
  it('upgrades a pre-existing IndexedDB v1 without losing session history', async () => {
    const record = applyPracticeCommand(null, makeStart('legacy')).next;
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('modu-language-learning', 1);
      open.onupgradeneeded = () => {
        const db = open.result;
        const sessions = db.createObjectStore('sessions', {keyPath:'id'});
        sessions.createIndex('updatedAt','updatedAt',{unique:false});
        db.createObjectStore('attempts',{keyPath:'id'});
      };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(['sessions','attempts'],'readwrite');
        tx.objectStore('sessions').add({id:'legacy',updatedAt:123,record});
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
    expect((await learningPersistence.latest())?.session.id).toBe('legacy');
    const updated = await learningPersistence.execute(reveal('legacy'),1);
    expect(updated.revision).toBe(2);
    expect((await learningPersistence.latest())?.revision).toBe(2);
  });
  it('restores after reopening the database and preserves versioned evidence', async () => {
    const initial = await learningPersistence.execute(makeStart('s1'),null);
    const seen = await learningPersistence.execute(reveal('s1'),initial.revision);
    const saved = await learningPersistence.execute(attempt('s1','a1'),seen.revision);
    expect(saved.session.attempts[0].evidence).toEqual({kind:'recall',rating:'good',
      assessment:{version:1,source:'self_rating',outcome:'recalled',effort:'normal'}});
    expect((await learningPersistence.latest())?.session.attempts).toEqual(saved.session.attempts);
    expect((await learningPersistence.get('s1'))?.session.status).toBe('completed');
  });
  it('acknowledges the same lost-response retry exactly once', async () => {
    const start = makeStart('s1');
    const one = await learningPersistence.execute(start,null);
    expect(await learningPersistence.execute(start,null)).toEqual(one);
    const two = await learningPersistence.execute(reveal('s1'),one.revision);
    const command=attempt('s1','a1');
    const three=await learningPersistence.execute(command,two.revision);
    expect(await learningPersistence.execute(command,two.revision)).toEqual(three);
    expect((await learningPersistence.get('s1'))?.session.attempts).toHaveLength(1);
    expect((await learningPersistence.get('japanese'))?.session.items[0].prompt)
      .toBe('お茶をください');
    await expect(learningPersistence.execute(attempt('s1','a1','easy'),two.revision))
      .rejects.toMatchObject({code:'invalid'});
  });
  it('serializes simultaneous tab writes and rejects stale revision', async () => {
    const initial=await learningPersistence.execute(makeStart('s1'),null);
    const results=await Promise.allSettled([
      learningPersistence.execute(reveal('s1'),initial.revision),
      learningPersistence.execute({type:'pause',sessionId:'s1'},initial.revision)
    ]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const failures=results.filter(r=>r.status==='rejected');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({reason:{code:'conflict'}});
    expect((await learningPersistence.get('s1'))?.revision).toBe(2);
  });
  it('rejects globally reused attempt IDs without partially advancing the second session', async () => {
    const a=await learningPersistence.execute(makeStart('a'),null);
    const b=await learningPersistence.execute(makeStart('b'),null);
    const revealedA=await learningPersistence.execute(reveal('a'),a.revision);
    const revealedB=await learningPersistence.execute(reveal('b'),b.revision);
    await learningPersistence.execute(attempt('a','shared'),revealedA.revision);
    await expect(learningPersistence.execute(attempt('b','shared'),revealedB.revision))
      .rejects.toMatchObject({code:'conflict'});
    expect((await learningPersistence.get('b'))?.session.attempts).toHaveLength(0);
    expect((await learningPersistence.get('b'))?.revision).toBe(revealedB.revision);
  });
  it('isolates language profiles and returns most recently modified session', async () => {
    await learningPersistence.execute(makeStart('en-session','en'),null);
    const jp=await learningPersistence.execute(makeStart('jp-session','ja'),null);
    const saved=await learningPersistence.execute(reveal('jp-session'),jp.revision);
    expect((await learningPersistence.latest())?.session.id).toBe(saved.session.id);
    expect((await learningPersistence.get('en-session'))?.session.profileId).toBe('en');
    expect((await learningPersistence.get('jp-session'))?.session.profileId).toBe('ja');
  });
  it('preserves latest-session identity even when writes share the same timestamp', async () => {
    const clock=vi.spyOn(Date,'now').mockReturnValue(1000);
    try {
      await learningPersistence.execute(makeStart('z-last-alphabetically'),null);
      await learningPersistence.execute(makeStart('a-actually-latest'),null);
      expect((await learningPersistence.latest())?.session.id).toBe('a-actually-latest');
      const backup=await learningPersistence.exportBackup();
      expect(JSON.parse(backup).latestSessionId).toBe('a-actually-latest');
      await learningPersistence.importBackup(backup);
      expect((await learningPersistence.latest())?.session.id).toBe('a-actually-latest');
    } finally { clock.mockRestore(); }
  });
  it('blocks a stale tab after backup restore even when session revision is unchanged', async () => {
    const before = await learningPersistence.execute(makeStart('same-session'), null);
    const backup = await learningPersistence.exportBackup();
    await learningPersistence.importBackup(backup);
    const restored = await learningPersistence.latest();
    expect(restored?.revision).toBe(before.revision);
    expect(restored?.storageEpoch).not.toBe(before.storageEpoch);
    await expect(learningPersistence.execute(
      {type:'pause', sessionId:'same-session'}, before.revision, before.storageEpoch
    )).rejects.toMatchObject({code:'conflict'});
    expect((await learningPersistence.get('same-session'))?.session.status).toBe('active');
    const resumed = await learningPersistence.execute(
      {type:'pause', sessionId:'same-session'}, restored!.revision, restored!.storageEpoch
    );
    expect(resumed.session.status).toBe('paused');
  });
  it('round-trips a versioned backup after replacing the database', async () => {
    const s=await learningPersistence.execute(makeStart('s1'),null);
    const revealed=await learningPersistence.execute(reveal('s1'),s.revision);
    await learningPersistence.execute(attempt('s1','a1'),revealed.revision);
    await learningPersistence.execute(makeStart('japanese','ja'),null);
    const backup=await learningPersistence.exportBackup();
    expect(JSON.parse(backup).format).toBe('modu-language-learning');
    expect(backup).toContain('お茶をください');
    await learningPersistence.execute(makeStart('discard-this'),null);
    await learningPersistence.importBackup(backup);
    expect(await learningPersistence.get('discard-this')).toBe(null);
    expect((await learningPersistence.get('s1'))?.session.attempts).toHaveLength(1);
    await expect(learningPersistence.execute(attempt('s1','a1','easy'),revealed.revision))
      .rejects.toMatchObject({code:'invalid'});
  });
  it('never clears existing data for invalid backup or duplicate attempts', async () => {
    const start=await learningPersistence.execute(makeStart('s1'),null);
    const revealed=await learningPersistence.execute(reveal('s1'),start.revision);
    await learningPersistence.execute(attempt('s1','unique-attempt'),revealed.revision);
    const original=await learningPersistence.exportBackup();
    const invalid=JSON.parse(original);
    invalid.sessions[0].session.cursor=99;
    await expect(learningPersistence.importBackup(JSON.stringify(invalid)))
      .rejects.toBeInstanceOf(LearningPersistenceError);
    const duplicated=JSON.parse(original);
    const second=structuredClone(duplicated.sessions[0]);
    second.session.id='s2';
    second.session.attempts[0].sessionId='s2';
    duplicated.sessions.push(second);
    // Valid individual histories must still reject a shared global attempt ID.
    await expect(learningPersistence.importBackup(JSON.stringify(duplicated)))
      .rejects.toBeInstanceOf(LearningPersistenceError);
    expect(await learningPersistence.exportBackup()).toBeDefined();
    expect((await learningPersistence.get('s1'))?.session.id).toBe('s1');
    await expect(learningPersistence.importBackup('bad JSON')).rejects.toMatchObject({code:'invalid'});
    expect((await learningPersistence.get('s1'))?.session.id).toBe('s1');
  });
});
