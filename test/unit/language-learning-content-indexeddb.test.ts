import 'fake-indexeddb/auto';
import {beforeEach,describe,expect,it} from 'vitest';
import {learningPersistence} from '../../src/lib/modules/language-learning/adapters/persistence.ts';
import type {IslandDraft} from '../../src/lib/modules/language-learning/core/content.ts';

const profile={id:'user-japanese',targetLanguage:'ja'};
const draft:IslandDraft={
  id:'shopping',title:'At the market',sourceLanguage:'id',targetLanguage:'ja',
  sentences:[
    {id:'rice',prompt:'Saya membeli nasi.',answer:'ご飯を買います。'},
    {id:'water',prompt:'Saya minum air.',answer:'水を飲みます。'}
  ],
  vocabulary:[
    {id:'term-rice',sentenceId:'rice',term:'ご飯',meaning:'rice'}
  ]
};
const wipe=()=>new Promise<void>((resolve,reject)=>{
  const req=indexedDB.deleteDatabase('modu-language-learning');
  req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);
  req.onblocked=()=>reject(new Error('Leaked database connection'));
});
beforeEach(wipe);
describe('M5 — IndexedDB content authority',()=>{
  it('migrates an M3 database and discovers legacy profile identity without erasing sessions',async()=>{
    await new Promise<void>((resolve,reject)=>{
      const req=indexedDB.open('modu-language-learning',3);
      req.onupgradeneeded=()=>{
        const db=req.result;
        const sessions=db.createObjectStore('sessions',{keyPath:'id'});
        sessions.createIndex('updatedAt','updatedAt');
        db.createObjectStore('attempts',{keyPath:'id'});
        db.createObjectStore('meta',{keyPath:'key'});
        const reviews=db.createObjectStore('reviews',{keyPath:'key'});
        reviews.createIndex('profileDue',['profileId','dueAt']);
      };
      req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{
        const db=req.result;
        const tx=db.transaction(['sessions'],'readwrite');
        const record={schemaVersion:1,revision:1,session:{
          id:'historic-ja',profileId:'legacy-ja',islandId:'old-island',
          mode:'recall',status:'active',phase:'prompt',cursor:0,
          items:[{id:'legacy',revision:1,prompt:'Air',answer:'水',
            islandId:'old-island',sourceLanguage:'id',targetLanguage:'ja'}],
          attempts:[]
        }};
        tx.objectStore('sessions').add({id:'historic-ja',updatedAt:1000,record});
        tx.oncomplete=()=>{db.close();resolve();};
        tx.onabort=()=>{db.close();reject(tx.error);};
      };
    });
    const identities=await learningPersistence.profiles();
    expect(identities).toContainEqual({id:'legacy-ja',targetLanguage:'ja'});
    expect((await learningPersistence.get('historic-ja'))?.session.profileId).toBe('legacy-ja');
    expect(await learningPersistence.catalog('legacy-ja')).toEqual([]);
    expect((await learningPersistence.planStored({id:'legacy-ja',targetLanguage:'ja'},{now:1000}))
      .plan.allCaughtUp).toBe(true);
  });
  it('migrates the starter catalog once without overwriting archived content',async()=>{
    const profiles=await learningPersistence.profiles();
    expect(profiles).toEqual([{id:'starter-id-en',targetLanguage:'en'}]);
    const catalog=await learningPersistence.catalog('starter-id-en');
    expect(catalog.map(x=>x.island.id)).toEqual(['starter-en-cafe']);
    const archived=await learningPersistence.setArchived('starter-id-en',catalog[0].island.id,1,true);
    expect(archived.archived).toBe(true);
    expect(await learningPersistence.catalog('starter-id-en')).toEqual([]);
    expect((await learningPersistence.catalog('starter-id-en',true))[0].archived).toBe(true);
    expect((await learningPersistence.profiles())).toHaveLength(1);
    expect(await learningPersistence.catalog('starter-id-en')).toEqual([]);
  });
  it('isolates new language profile and uses persisted catalog for M4 recommendations',async()=>{
    await learningPersistence.createProfile(profile);
    const saved=await learningPersistence.saveIsland(profile.id,draft,null);
    expect(saved.vocabulary[0]).toMatchObject({sentenceId:'rice',sentenceRevision:1});
    const selection=await learningPersistence.planStored(profile,{now:1000,maxItems:5,maxNew:2});
    expect(selection.plan.newCount).toBe(2);
    expect(selection.plan.tasks.map(x=>x.sentenceId)).toEqual(['rice','water']);
    expect(selection.islands[0].sentences[0].answer).toBe('ご飯を買います。');
    const english=await learningPersistence.planStored(
      {id:'starter-id-en',targetLanguage:'en'},{now:1000});
    expect(english.plan.tasks.every(x=>x.islandId!=='shopping')).toBe(true);
  });
  it('preserves SRS history across edits, archives, and restores',async()=>{
    await learningPersistence.createProfile(profile);
    await learningPersistence.saveIsland(profile.id,draft,null);
    const start=await learningPersistence.execute({type:'start',sessionId:'s1',
      profileId:profile.id,mode:'recall',island:{...draft,revision:1,
        sentences:[{...draft.sentences[0],revision:1}]}},null);
    const reveal=await learningPersistence.execute({type:'reveal',sessionId:'s1'},start.revision);
    await learningPersistence.execute({type:'attempt',sessionId:'s1',attempt:{
      attemptId:'a1',sentenceId:'rice',sentenceRevision:1,
      evidence:{kind:'recall',rating:'again'},recordedAt:1000
    }},reveal.revision);
    expect((await learningPersistence.getMemory(profile.id,'shopping','rice',1))?.lastAttemptId).toBe('a1');
    const original=(await learningPersistence.catalog(profile.id))[0];
    const edited=await learningPersistence.saveIsland(profile.id,{
      ...draft,confirmRetainedVocabulary:true,sentences:[
        {...draft.sentences[0],answer:'お米を買います。'},
        draft.sentences[1]
      ]
    },original.island.revision);
    expect(edited.island.sentences.map(s=>s.revision)).toEqual([2,1]);
    expect(edited.vocabulary[0].sentenceRevision).toBe(2);
    const plan=await learningPersistence.planStored(profile,{now:900000,maxItems:2,maxNew:2});
    expect(plan.plan.dueCount).toBe(0);
    expect(plan.plan.excludedOldRevisions).toBe(1);
    expect(plan.plan.tasks[0]).toMatchObject({kind:'new',sentenceId:'rice',sentenceRevision:2});
    await learningPersistence.setArchived(profile.id,'shopping',edited.island.revision,true);
    expect((await learningPersistence.planStored(profile,{now:900000})).plan.tasks).toEqual([]);
    const archived=(await learningPersistence.catalog(profile.id,true))[0];
    await learningPersistence.setArchived(profile.id,'shopping',archived.island.revision,false);
    expect((await learningPersistence.planStored(profile,{now:900000})).plan.newCount).toBe(2);
    expect((await learningPersistence.get('s1'))?.session.attempts).toHaveLength(1);
  });
  it('fences a recommended start after another tab edits or archives the Island',async()=>{
    await learningPersistence.createProfile(profile);
    const first=await learningPersistence.saveIsland(profile.id,draft,null);
    const plan=await learningPersistence.planStored(profile,{now:1000});
    const planned=plan.islands[0];
    const edited=await learningPersistence.saveIsland(profile.id,{
      ...draft,title:'Updated elsewhere'
    },first.island.revision);
    const requested={type:'start' as const,sessionId:'stale-start',profileId:profile.id,
      mode:'recall' as const,island:planned};
    await expect(learningPersistence.execute(requested,null,undefined,planned.revision))
      .rejects.toMatchObject({code:'conflict'});
    expect(await learningPersistence.get('stale-start')).toBe(null);
    const fresh=await learningPersistence.planStored(profile,{now:1000});
    const created=await learningPersistence.execute({...requested,
      sessionId:'fresh-start',island:fresh.islands[0]},null,undefined,edited.island.revision);
    expect(created.session.items).toHaveLength(2);
    const archived=await learningPersistence.setArchived(profile.id,'shopping',edited.island.revision,true);
    await expect(learningPersistence.execute({...requested,sessionId:'archived-start',
      island:archived.island},null,undefined,archived.island.revision))
      .rejects.toMatchObject({code:'conflict'});
    expect(await learningPersistence.get('archived-start')).toBe(null);
  });
  it('rejects stale concurrent Island saves without overwriting prior content',async()=>{
    await learningPersistence.createProfile(profile);
    const first=await learningPersistence.saveIsland(profile.id,draft,null);
    const results=await Promise.allSettled([
      learningPersistence.saveIsland(profile.id,{...draft,title:'Edited one'},first.island.revision),
      learningPersistence.saveIsland(profile.id,{...draft,title:'Edited two'},first.island.revision)
    ]);
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(x=>x.status==='rejected')).toHaveLength(1);
    expect((await learningPersistence.catalog(profile.id))[0].island.revision).toBe(2);
  });
  it('imports new Islands atomically, never replacing existing IDs',async()=>{
    await learningPersistence.createProfile(profile);
    const another={...draft,id:'hotel',title:'Hotel'};
    const payload=(islands:unknown[])=>JSON.stringify({
      format:'modu-language-catalog',version:1,islands
    });
    expect(await learningPersistence.importCatalog(profile.id,payload([draft,another]))).toBe(2);
    const original=await learningPersistence.catalog(profile.id);
    expect(original).toHaveLength(2);
    await expect(learningPersistence.importCatalog(profile.id,payload([
      {...draft,id:'fresh'},another
    ]))).rejects.toMatchObject({code:'conflict'});
    expect((await learningPersistence.catalog(profile.id)).map(x=>x.island.id).sort())
      .toEqual(['hotel','shopping']);
    await expect(learningPersistence.importCatalog(profile.id,payload([
      {...draft,id:'new',vocabulary:[{...draft.vocabulary[0],sentenceId:'missing'}]}
    ]))).rejects.toMatchObject({code:'invalid'});
    expect((await learningPersistence.catalog(profile.id)).length).toBe(2);
    const exported=await learningPersistence.exportCatalog(profile.id);
    expect(JSON.parse(exported).islands).toHaveLength(2);
  });
  it('does not admit more active sentences than the M4 planner can handle',async()=>{
    await learningPersistence.createProfile(profile);
    const large=(id:string,count:number):IslandDraft=>({
      id,title:id,sourceLanguage:'id',targetLanguage:'ja',
      sentences:Array.from({length:count},(_,i)=>({
        id:'sentence-'+i,prompt:'prompt-'+i,answer:'answer-'+i
      })),
      vocabulary:[]
    });
    await learningPersistence.saveIsland(profile.id,large('batch-a',500),null);
    const second=await learningPersistence.saveIsland(profile.id,large('batch-b',500),null);
    await expect(learningPersistence.saveIsland(profile.id,large('overflow',1),null))
      .rejects.toMatchObject({code:'invalid'});
    expect((await learningPersistence.catalog(profile.id)).length).toBe(2);
    await learningPersistence.setArchived(profile.id,'batch-b',second.island.revision,true);
    await learningPersistence.saveIsland(profile.id,large('small',1),null);
    await expect(learningPersistence.setArchived(profile.id,'batch-b',
      second.island.revision+1,false)).rejects.toMatchObject({code:'invalid'});
    expect((await learningPersistence.catalog(profile.id,true)).find(x=>x.island.id==='batch-b')?.archived)
      .toBe(true);
    const imported={format:'modu-language-catalog',version:1,islands:[large('new-500',500)]};
    await expect(learningPersistence.importCatalog(profile.id,JSON.stringify(imported)))
      .rejects.toMatchObject({code:'invalid'});
    expect((await learningPersistence.catalog(profile.id,true)).some(x=>x.island.id==='new-500')).toBe(false);
  });
  it('full v3 backup round-trip restores all language profiles, vocabulary and archive state',async()=>{
    await learningPersistence.createProfile(profile);
    const original=await learningPersistence.saveIsland(profile.id,draft,null);
    await learningPersistence.setArchived(profile.id,draft.id,original.island.revision,true);
    const backup=await learningPersistence.exportBackup();
    const parsed=JSON.parse(backup);
    expect(parsed.version).toBe(3);
    expect(parsed.profiles.some((p:{id:string})=>p.id===profile.id)).toBe(true);
    expect(parsed.catalogs.find((c:{profileId:string})=>c.profileId===profile.id).archived).toBe(true);
    await learningPersistence.importBackup(backup);
    expect((await learningPersistence.catalog(profile.id,true))[0].vocabulary[0].meaning).toBe('rice');
    expect((await learningPersistence.catalog(profile.id)).length).toBe(0);
    const invalid=JSON.parse(backup);
    invalid.catalogs.find((c:{profileId:string})=>c.profileId===profile.id).vocabulary[0].sentenceRevision=99;
    await expect(learningPersistence.importBackup(JSON.stringify(invalid))).rejects.toBeDefined();
    expect((await learningPersistence.catalog(profile.id,true))[0].vocabulary).toHaveLength(1);
  });
  it('legacy v2 history backup remains importable and seeds its prelaunch starter catalog',async()=>{
    const original=JSON.parse(await learningPersistence.exportBackup());
    const previous={...original,version:2};
    delete previous.profiles;
    delete previous.catalogs;
    await learningPersistence.importBackup(JSON.stringify(previous));
    expect((await learningPersistence.catalog('starter-id-en')).map(x=>x.island.id))
      .toEqual(['starter-en-cafe']);
  });
});
