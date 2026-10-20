import {
  applyPracticeCommand, decodeStoredPractice, PracticeStorageRuleError,
  type PracticeCommand, type StoredPractice
} from '../core/persistence.ts';
import { LearningRuleError, type PracticeAttempt } from '../core/learning.ts';
import {
  MemoryRuleError, memoryKey, scheduleRatedAttempt, rebuildMemoryStates,
  decodeMemoryState, type MemoryState
} from '../core/memory.ts';
import {
  catalogKeys, createLearningPlan, OrchestrationRuleError,
  type LearningProfile, type LearningPlan, type PlanOptions
} from '../core/orchestration.ts';
import type { LanguageIsland } from '../core/learning.ts';
import {
  archiveIsland, decodeLearningProfile, reviseIsland, validateContentIsland,
  ContentRuleError, type ContentIsland, type IslandDraft
} from '../core/content.ts';
import { STARTER_ISLAND } from './starter-content.ts';
import {projectLearningProgress,type LearningProgress} from '../core/progress.ts';
import {
  OUTBOX_STORE, SYNC_META_STORE, ensureOutboxStores, queueLocalMutation,
  resetCaptureAfterRestore, readOutbox, acknowledgeOutbox, initializeCaptureWithBaseline
} from '#lib/platform/data/outbox.ts';

/** Browser-local, single-learner storage. All authoritative writes use one IDB transaction. */
export class LearningPersistenceError extends Error {
  constructor(readonly code:
    'unavailable' | 'conflict' | 'invalid' | 'corrupt' | 'quota' | 'blocked',
    message: string) {
    super(message);
    this.name = 'LearningPersistenceError';
  }
}
const DB_NAME = 'modu-language-learning';
const DB_VERSION = 5;
const SESSIONS = 'sessions';
const ATTEMPTS = 'attempts';
const META = 'meta';
const REVIEWS = 'reviews';
const PROFILES = 'profiles';
const CATALOGS = 'catalogs';
const BACKUP_FORMAT = 'modu-language-learning';
const MAX_BACKUP_LENGTH = 256 * 1024 * 1024;
const MAX_CATALOG_LENGTH = 32 * 1024 * 1024;

interface SessionRow {
  id: string;
  updatedAt: number;
  record: StoredPractice;
}
type BrowserPractice = StoredPractice & {storageEpoch: string | null};
export interface LearningBackup {
  format: typeof BACKUP_FORMAT;
  version: 1 | 2 | 3;
  exportedAt: string;
  sessions: StoredPractice[];
  latestSessionId?: string | null;
  reviews?: MemoryState[];
  profiles?: LearningProfile[];
  catalogs?: ContentIsland[];
}
function translateError(cause: unknown): LearningPersistenceError {
  if (cause instanceof LearningPersistenceError) return cause;
  if (cause instanceof PracticeStorageRuleError) {
    return new LearningPersistenceError(
      cause.code === 'conflict' ? 'conflict' : cause.code === 'corrupt' ? 'corrupt' : 'invalid',
      cause.message
    );
  }
  if (cause instanceof LearningRuleError) return new LearningPersistenceError('invalid', cause.message);
  if (cause instanceof MemoryRuleError) return new LearningPersistenceError(cause.code === 'invalid_state' ? 'corrupt' : 'invalid', cause.message);
  if (cause instanceof ContentRuleError) return new LearningPersistenceError(cause.code==='conflict'?'conflict':'invalid',cause.message);
  if (cause instanceof OrchestrationRuleError) {
    return new LearningPersistenceError('invalid', cause.message);
  }
  if (cause instanceof DOMException && cause.name === 'QuotaExceededError') {
    return new LearningPersistenceError('quota', 'Browser storage quota is full. Export data and free space.');
  }
  if (cause instanceof DOMException && cause.name === 'ConstraintError') {
    return new LearningPersistenceError('conflict', 'Attempt identity already exists. Reload saved progress.');
  }
  return new LearningPersistenceError('unavailable', 'Unable to access browser learning storage.');
}
function decodeSessionRow(value: unknown): StoredPractice | null {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LearningPersistenceError('corrupt', 'Invalid stored practice row.');
  }
  const row = value as Partial<SessionRow>;
  const record = decodeStoredPractice(row.record);
  if (row.id !== record.session.id || !Number.isSafeInteger(row.updatedAt) ||
    (row.updatedAt as number) < 0) {
    throw new LearningPersistenceError('corrupt', 'Stored practice identity or date is invalid.');
  }
  return record;
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new LearningPersistenceError('unavailable', 'IndexedDB is unavailable in this browser.'));
      return;
    }
    let cancelled = false;
    let settled = false;
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (cause) { reject(translateError(cause)); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSIONS)) {
        const store = db.createObjectStore(SESSIONS, {keyPath: 'id'});
        store.createIndex('updatedAt', 'updatedAt', {unique: false});
      }
      if (!db.objectStoreNames.contains(ATTEMPTS)) {
        db.createObjectStore(ATTEMPTS, {keyPath: 'id'});
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, {keyPath: 'key'});
      }
      if (!db.objectStoreNames.contains(REVIEWS)) {
        const store = db.createObjectStore(REVIEWS, {keyPath: 'key'});
        store.createIndex('profileDue', ['profileId', 'dueAt'], {unique: false});
      }
      if(!db.objectStoreNames.contains(PROFILES)){
        db.createObjectStore(PROFILES,{keyPath:'id'});
      }
      if(!db.objectStoreNames.contains(CATALOGS)){
        const catalog=db.createObjectStore(CATALOGS,{keyPath:'key'});
        catalog.createIndex('profileId','profileId',{unique:false});
      }
      ensureOutboxStores(db);
    };
    request.onblocked = () => {
      cancelled = true;
      if (!settled) {
        settled = true;
        reject(new LearningPersistenceError('blocked',
          'A different tab is blocking the learning database upgrade. Close it and retry.'));
      }
    };
    request.onerror = () => {
      if (!settled) { settled = true; reject(translateError(request.error)); }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (cancelled) { db.close(); return; }
      db.onversionchange = () => db.close();
      if (!settled) { settled = true; resolve(db); }
      else db.close();
    };
  });
}
/** Owns connection and transaction lifetime. Never await inside IDB request callbacks. */
async function transaction<T>(
  stores: string[], mode: IDBTransactionMode,
  start: (tx: IDBTransaction, complete: (value: T) => void, fail: (error: unknown) => void) => void
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = mode === 'readwrite'
        ? db.transaction(stores, mode, {durability: 'strict'})
        : db.transaction(stores, mode);
    } catch (cause) { db.close(); reject(translateError(cause)); return; }
    let result: T;
    let failure: unknown;
    let hasResult = false;
    const complete = (value: T) => { result = value; hasResult = true; };
    const fail = (cause: unknown) => {
      failure = cause;
      try { tx.abort(); } catch { /* already aborted */ }
    };
    tx.oncomplete = () => {
      db.close();
      if (failure) reject(translateError(failure));
      else if (hasResult) resolve(result);
      else reject(new LearningPersistenceError('corrupt', 'Learning transaction completed without a result.'));
    };
    tx.onabort = () => {
      db.close();
      reject(translateError(failure ?? tx.error));
    };
    try { start(tx, complete, fail); }
    catch (cause) { fail(cause); }
  });
}
function asBackup(text: string): {records: StoredPractice[]; attempts: PracticeAttempt[]; reviews: MemoryState[]; latestSessionId: string | null; profiles: LearningProfile[]; catalogs: ContentIsland[]} {
  if (!text || new Blob([text]).size > MAX_BACKUP_LENGTH) {
    throw new LearningPersistenceError('invalid', 'Backup is empty or exceeds the 256 MiB import limit.');
  }
  let raw: unknown;
  try { raw = JSON.parse(text); }
  catch { throw new LearningPersistenceError('invalid', 'Backup is not valid JSON.'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new LearningPersistenceError('invalid', 'Invalid backup document.');
  }
  const doc = raw as Partial<LearningBackup>;
  if (doc.format !== BACKUP_FORMAT || (doc.version !== 1 && doc.version !== 2 && doc.version !== 3) || !Array.isArray(doc.sessions)) {
    throw new LearningPersistenceError('invalid', 'Unsupported backup format or version.');
  }
  const sessionIds = new Set<string>(), attemptIds = new Set<string>();
  const records: StoredPractice[] = [];
  const attempts: PracticeAttempt[] = [];
  for (const rawSession of doc.sessions as unknown[]) {
    let record: StoredPractice;
    try { record = decodeStoredPractice(rawSession); }
    catch { throw new LearningPersistenceError('corrupt', 'Backup contains invalid practice history.'); }
    if (sessionIds.has(record.session.id)) {
      throw new LearningPersistenceError('invalid', 'Backup contains repeated session IDs.');
    }
    sessionIds.add(record.session.id);
    records.push(record);
    for (const attempt of record.session.attempts) {
      if (attemptIds.has(attempt.id)) {
        throw new LearningPersistenceError('invalid', 'Backup reuses an attempt ID across sessions.');
      }
      attemptIds.add(attempt.id);
      attempts.push(attempt);
    }
  }
  const latestSessionId = doc.latestSessionId ?? (records.at(-1)?.session.id ?? null);
  if (latestSessionId !== null &&
    (typeof latestSessionId !== 'string' || !sessionIds.has(latestSessionId))) {
    throw new LearningPersistenceError('invalid', 'Backup refers to a missing latest session.');
  }
  // Older M1 backups have no review journal. Replay rated attempts into the
  // initial SRS state; v2 backups preserve the actual journal's last state.
  const events = records.flatMap(record => record.session.attempts.map(attempt => ({
    attempt, islandId: record.session.islandId
  })));
  let reviews: MemoryState[];
  if (doc.version === 1) {
    reviews = rebuildMemoryStates(events);
  } else {
    if (!Array.isArray(doc.reviews)) {
      throw new LearningPersistenceError('invalid', 'Version 2 backups require review states.');
    }
    const validAttempts = new Map(events.filter(e => e.attempt.evidence.kind === 'recall')
      .map(e => [e.attempt.id, e]));
    const allReviewKeys = new Set(events.filter(e => e.attempt.evidence.kind === 'recall')
      .map(e => memoryKey({profileId:e.attempt.profileId, islandId:e.islandId,
        sentenceId:e.attempt.sentenceId, sentenceRevision:e.attempt.sentenceRevision})));
    const keys = new Set<string>();
    reviews = (doc.reviews as unknown[]).map(raw => {
      let state: MemoryState;
      try { state = decodeMemoryState(raw); }
      catch { throw new LearningPersistenceError('corrupt', 'Backup contains invalid memory state.'); }
      if (keys.has(state.key)) throw new LearningPersistenceError('invalid', 'Duplicate memory state key.');
      keys.add(state.key);
      const source = validAttempts.get(state.lastAttemptId);
      if (!source || memoryKey({profileId:source.attempt.profileId,
        islandId:source.islandId,sentenceId:source.attempt.sentenceId,
        sentenceRevision:source.attempt.sentenceRevision}) !== state.key ||
        state.lastReviewedAt < source.attempt.recordedAt) {
        throw new LearningPersistenceError('corrupt', 'Memory state has no matching rated attempt.');
      }
      return state;
    });
    if (keys.size !== allReviewKeys.size ||
      [...allReviewKeys].some(key => !keys.has(key))) {
      throw new LearningPersistenceError('corrupt', 'Backup is missing memory states for rated attempts.');
    }
  }
  let profiles:LearningProfile[];
  let catalogs:ContentIsland[];
  if(doc.version===3){
    if(!Array.isArray(doc.profiles)||!Array.isArray(doc.catalogs) ||
      doc.profiles.length>100 || doc.catalogs.length>1000)
      throw new LearningPersistenceError('invalid','Version 3 backup is missing profiles or catalog.');
    profiles=(doc.profiles as unknown[]).map(decodeLearningProfile);
    const byProfile=new Map(profiles.map(p=>[p.id,p]));
    if(byProfile.size!==profiles.length)
      throw new LearningPersistenceError('invalid','Backup contains repeated profile IDs.');
    catalogs=(doc.catalogs as unknown[]).map(raw=>{
      const item=validateContentIsland(raw);
      const profile=byProfile.get(item.profileId);
      if(!profile)return failContent('Catalog references an unknown profile.');
      return validateContentIsland(item,profile);
    });
    const identities=new Set(catalogs.map(x=>catalogKey(x.profileId,x.island.id)));
    if(identities.size!==catalogs.length)
      throw new LearningPersistenceError('invalid','Backup repeats an Island identity.');
  } else {
    profiles=profilesFromSessions(records);
    catalogs=[starterContent];
  }
  return {records, attempts, reviews, latestSessionId,profiles,catalogs};
}
/** Non-destructive v2→v3 migration of M1/M2 history. Readwrite scope serializes
 * this projection against new commits and backup restore in every browser tab. */
async function ensureMemoryInitialized(): Promise<void> {
  await transaction<void>([SESSIONS, META, REVIEWS, ATTEMPTS], 'readwrite', (tx, complete, fail) => {
    const marker = tx.objectStore(META).get('memoryBootstrapV1');
    marker.onsuccess = () => {
      try {
        if (marker.result?.done === true) { complete(undefined); return; }
        const request = tx.objectStore(SESSIONS).getAll();
        request.onsuccess = () => {
          try {
            const events: {attempt: PracticeAttempt; islandId: string}[] = [];
            for (const row of request.result as unknown[]) {
              const record = decodeSessionRow(row);
              if (!record) throw new LearningPersistenceError('corrupt', 'Missing historical practice.');
              for (const attempt of record.session.attempts) {
                events.push({attempt, islandId: record.session.islandId});
              }
            }
            const reviews = rebuildMemoryStates(events);
            const store = tx.objectStore(REVIEWS);
            for (const state of reviews) store.put(state);
            tx.objectStore(META).put({key:'memoryBootstrapV1', done:true});
            complete(undefined);
          } catch (cause) { fail(cause); }
        };
      } catch (cause) { fail(cause); }
    };
  });
}


function failContent(message:string):never {
  throw new LearningPersistenceError('invalid',message);
}
/** Backfill explicit language profiles from old M0–M3 immutable session snapshots. */
function profilesFromSessions(records:readonly StoredPractice[]):LearningProfile[] {
  const known=new Map<string,LearningProfile>([[starterProfile.id,starterProfile]]);
  for(const record of records){
    const id=record.session.profileId;
    const language=record.session.items[0]?.targetLanguage;
    const previous=known.get(id);
    if(!language || (previous && previous.targetLanguage!==language))
      throw new LearningPersistenceError('corrupt','Historical profile has inconsistent target languages.');
    if(!previous)known.set(id,decodeLearningProfile({id,targetLanguage:language}));
  }
  return [...known.values()];
}
type CatalogRow = {key:string;profileId:string;content:ContentIsland};
function catalogKey(profileId:string,islandId:string):string {
  return JSON.stringify([profileId,islandId]);
}
function decodeCatalogRow(raw:unknown):ContentIsland {
  if(!raw || typeof raw!=='object')throw new LearningPersistenceError('corrupt','Invalid content row.');
  const row=raw as Partial<CatalogRow>;
  let content:ContentIsland;
  try {content=validateContentIsland(row.content);}
  catch {throw new LearningPersistenceError('corrupt','Stored Island data is invalid.');}
  if(row.profileId!==content.profileId || row.key!==catalogKey(content.profileId,content.island.id))
    throw new LearningPersistenceError('corrupt','Catalog key or profile does not match Island.');
  return content;
}
const starterProfile:LearningProfile={id:'starter-id-en',targetLanguage:'en'};
const starterContent:ContentIsland={
  profileId:starterProfile.id,archived:false,island:STARTER_ISLAND,vocabulary:[]
};
/** One-time non-destructive seed, serialized with all content writers.
 * The marker prevents user-empty catalogs from silently reseeding. */
async function ensureCatalogInitialized():Promise<void> {
  await transaction<void>([PROFILES,CATALOGS,META,SESSIONS],'readwrite',(tx,complete,fail)=>{
    const marker=tx.objectStore(META).get('catalogSeedV1');
    marker.onsuccess=()=>{
      try {
        if(marker.result?.done===true){complete(undefined);return;}
        const profiles=tx.objectStore(PROFILES);
        const catalogs=tx.objectStore(CATALOGS);
        const history=tx.objectStore(SESSIONS).getAll();
        history.onsuccess=()=>{
          try {
            const records=(history.result as unknown[]).map(decodeSessionRow);
            if(records.some(x=>x===null))
              throw new LearningPersistenceError('corrupt','Historical session record is missing.');
            const candidates=profilesFromSessions(records as StoredPractice[]);
            const existing=profiles.getAll();
            existing.onsuccess=()=>{
              try {
                const known=new Map((existing.result as unknown[])
                  .map(decodeLearningProfile).map(p=>[p.id,p]));
                for(const candidate of candidates){
                  const prior=known.get(candidate.id);
                  if(prior && prior.targetLanguage!==candidate.targetLanguage)
                    throw new LearningPersistenceError('corrupt','Stored profile conflicts with historic sessions.');
                  if(!prior)profiles.add(candidate);
                }
                const key=catalogKey(starterProfile.id,STARTER_ISLAND.id);
                const present=catalogs.get(key);
                present.onsuccess=()=>{
                  try {
                    if(present.result===undefined)catalogs.add({
                      key,profileId:starterProfile.id,content:starterContent
                    } satisfies CatalogRow);
                    tx.objectStore(META).put({key:'catalogSeedV1',done:true});
                    complete(undefined);
                  }catch(cause){fail(cause);}
                };
              }catch(cause){fail(cause);}
            };
          }catch(cause){fail(cause);}
        };
      }catch(cause){fail(cause);}
    };
  });
}

/** No server endpoint. This browser origin owns the canonical practice history. */
export const learningPersistence = {
  async beginSyncCapture(deviceId: string): Promise<void> {
    await ensureCatalogInitialized();
    await ensureMemoryInitialized();
    return transaction<void>(
      [SESSIONS, META, REVIEWS, PROFILES, CATALOGS, OUTBOX_STORE, SYNC_META_STORE],
      'readwrite', (tx, complete, fail) => {
        const sessions = tx.objectStore(SESSIONS).getAll();
        const reviews = tx.objectStore(REVIEWS).getAll();
        const profiles = tx.objectStore(PROFILES).getAll();
        const catalogs = tx.objectStore(CATALOGS).getAll();
        const latest = tx.objectStore(META).get('latest');
        let remaining = 5;
        const ready = () => {
          remaining--;
          if (remaining !== 0) return;
          try {
            const records = (sessions.result as unknown[]).map(row => {
              const decoded = decodeSessionRow(row);
              if (!decoded) throw new LearningPersistenceError('corrupt', 'Invalid session in sync baseline.');
              return decoded;
            });
            const states = (reviews.result as unknown[]).map(decodeMemoryState);
            const identities = (profiles.result as unknown[]).map(decodeLearningProfile);
            const islands = (catalogs.result as unknown[]).map(decodeCatalogRow);
            const pointer: unknown = latest.result?.sessionId ?? null;
            if (pointer !== null &&
                (typeof pointer !== 'string' || !records.some(row => row.session.id === pointer))) {
              throw new LearningPersistenceError('corrupt', 'Invalid latest session pointer in sync baseline.');
            }
            const backup: LearningBackup = {
              format: BACKUP_FORMAT, version: 3, exportedAt: new Date().toISOString(),
              sessions: records, latestSessionId: pointer as string | null,
              reviews: states, profiles: identities, catalogs: islands
            };
            // Same module-specific referential and evidence checks as manual restore.
            asBackup(JSON.stringify(backup));
            initializeCaptureWithBaseline(tx, 'language-learning', deviceId, backup);
            complete(undefined);
          } catch (cause) { fail(cause); }
        };
        sessions.onsuccess = ready;
        reviews.onsuccess = ready;
        profiles.onsuccess = ready;
        catalogs.onsuccess = ready;
        latest.onsuccess = ready;
      }
    );
  },
  async readPendingSyncOperations(limit = 100) {
    const db = await openDatabase();
    try { return await readOutbox(db, 'language-learning', limit); }
    finally { db.close(); }
  },
  async acknowledgeSyncOperations(operationIds: readonly string[]) {
    const db = await openDatabase();
    try { await acknowledgeOutbox(db, operationIds); }
    finally { db.close(); }
  },
  validateBackup(text: string) {
    const result = asBackup(text);
    return { records: result.records.length + result.reviews.length + result.profiles.length + result.catalogs.length };
  },
  async profiles():Promise<LearningProfile[]> {
    await ensureCatalogInitialized();
    return transaction<LearningProfile[]>([PROFILES],'readonly',(tx,complete,fail)=>{
      const req=tx.objectStore(PROFILES).getAll();
      req.onsuccess=()=>{
        try{complete((req.result as unknown[]).map(decodeLearningProfile));}
        catch(cause){fail(cause);}
      };
    });
  },
  async createProfile(profile:LearningProfile):Promise<LearningProfile> {
    let checked:LearningProfile;
    try{checked=decodeLearningProfile(profile);}
    catch(cause){throw translateError(cause);}
    await ensureCatalogInitialized();
    return transaction<LearningProfile>([PROFILES,OUTBOX_STORE,SYNC_META_STORE],'readwrite',(tx,complete,fail)=>{
      const store=tx.objectStore(PROFILES);
      const req=store.get(checked.id);
      req.onsuccess=()=>{
        try{
          if(req.result!==undefined)throw new LearningPersistenceError('conflict','Language profile already exists.');
          store.add(checked);
          queueLocalMutation(tx, 'language-learning', checked.id, 'upsert', { profile: checked });
          complete(checked);
        }catch(cause){fail(cause);}
      };
    });
  },
  async catalog(profileId:string,includeArchived=false):Promise<ContentIsland[]> {
    await ensureCatalogInitialized();
    return transaction<ContentIsland[]>([PROFILES,CATALOGS],'readonly',(tx,complete,fail)=>{
      const profileReq=tx.objectStore(PROFILES).get(profileId);
      profileReq.onsuccess=()=>{
        try{
          if(profileReq.result===undefined)throw new LearningPersistenceError('invalid','Language profile was not found.');
          const profile=decodeLearningProfile(profileReq.result);
          const rows=tx.objectStore(CATALOGS).index('profileId').getAll(profileId);
          rows.onsuccess=()=>{
            try{
              const items=(rows.result as unknown[]).map(decodeCatalogRow);
              for(const item of items)validateContentIsland(item,profile);
              complete(items.filter(x=>includeArchived || !x.archived));
            }catch(cause){fail(cause);}
          };
        }catch(cause){fail(cause);}
      };
    });
  },
  async saveIsland(profileId:string,draft:IslandDraft,expectedRevision:number|null):Promise<ContentIsland> {
    if(expectedRevision!==null && (!Number.isSafeInteger(expectedRevision)||expectedRevision<1))
      throw new LearningPersistenceError('invalid','Expected Island revision is invalid.');
    await ensureCatalogInitialized();
    return transaction<ContentIsland>([PROFILES,CATALOGS,OUTBOX_STORE,SYNC_META_STORE],'readwrite',(tx,complete,fail)=>{
      const profiles=tx.objectStore(PROFILES);
      const catalogs=tx.objectStore(CATALOGS);
      const profileReq=profiles.get(profileId);
      profileReq.onsuccess=()=>{
        try{
          if(profileReq.result===undefined)throw new LearningPersistenceError('invalid','Language profile was not found.');
          const profile=decodeLearningProfile(profileReq.result);
          if(!draft || typeof draft.id!=='string' || !draft.id.trim())
            throw new LearningPersistenceError('invalid','Island ID is required.');
          const key=catalogKey(profile.id,draft.id);
          const req=catalogs.get(key);
          req.onsuccess=()=>{
            try{
              const prior=req.result===undefined?null:decodeCatalogRow(req.result);
              if((prior?.island.revision??null)!==expectedRevision)
                throw new LearningPersistenceError('conflict','Island changed in another tab. Reload before editing.');
              const updated=reviseIsland(prior,profile,draft,prior?.archived??false);
              const items=catalogs.index('profileId').getAll(profile.id);
              items.onsuccess=()=>{
                try {
                  const catalog=(items.result as unknown[]).map(decodeCatalogRow)
                    .filter(x=>x.island.id!==updated.island.id);
                  catalog.push(updated);
                  catalogKeys(profile,catalog.filter(x=>!x.archived).map(x=>x.island));
                  catalogs.put({key,profileId:profile.id,content:updated} satisfies CatalogRow);
                  queueLocalMutation(tx, 'language-learning', key, 'upsert', { content: updated }, expectedRevision === null ? null : String(expectedRevision));
                  complete(updated);
                }catch(cause){fail(cause);}
              };
            }catch(cause){fail(cause);}
          };
        }catch(cause){fail(cause);}
      };
    });
  },
  async setArchived(profileId:string,islandId:string,expectedRevision:number,archived:boolean):Promise<ContentIsland> {
    await ensureCatalogInitialized();
    return transaction<ContentIsland>([CATALOGS,OUTBOX_STORE,SYNC_META_STORE],'readwrite',(tx,complete,fail)=>{
      const store=tx.objectStore(CATALOGS);
      const key=catalogKey(profileId,islandId);
      const req=store.get(key);
      req.onsuccess=()=>{
        try{
          if(req.result===undefined)throw new LearningPersistenceError('invalid','Island not found.');
          const existing=decodeCatalogRow(req.result);
          if(existing.island.revision!==expectedRevision)
            throw new LearningPersistenceError('conflict','Island was changed in another tab.');
          const next=archiveIsland(existing,archived);
          const rows=store.index('profileId').getAll(profileId);
          rows.onsuccess=()=>{
            try {
              const current=(rows.result as unknown[]).map(decodeCatalogRow)
                .filter(x=>x.island.id!==next.island.id);
              current.push(next);
              catalogKeys({id:profileId,targetLanguage:next.island.targetLanguage},
                current.filter(x=>!x.archived).map(x=>x.island));
              if(next!==existing) {
                store.put({key,profileId,content:next} satisfies CatalogRow);
                queueLocalMutation(tx, 'language-learning', key, 'upsert', { content: next }, String(expectedRevision));
              }
              complete(next);
            }catch(cause){fail(cause);}
          };
        }catch(cause){fail(cause);}
      };
    });
  },
  /** Import only new Island IDs, atomically. Never silently replace authored materials. */
  async importCatalog(profileId:string,text:string):Promise<number> {
    if(!text || new Blob([text]).size>MAX_CATALOG_LENGTH)
      throw new LearningPersistenceError('invalid','Catalog import exceeds 32 MiB.');
    let raw:unknown;
    try{raw=JSON.parse(text);}catch{throw new LearningPersistenceError('invalid','Invalid catalog JSON.');}
    if(!raw||typeof raw!=='object'||Array.isArray(raw))
      throw new LearningPersistenceError('invalid','Invalid catalog document.');
    const doc=raw as Record<string,unknown>;
    if(doc.format!=='modu-language-catalog'||doc.version!==1||!Array.isArray(doc.islands)||
      doc.islands.length>100)
      throw new LearningPersistenceError('invalid','Unsupported catalog document.');
    // Drafts are validated against the authoritative profile inside the transaction.
    await ensureCatalogInitialized();
    return transaction<number>([PROFILES,CATALOGS,OUTBOX_STORE,SYNC_META_STORE],'readwrite',(tx,complete,fail)=>{
      const req=tx.objectStore(PROFILES).get(profileId);
      req.onsuccess=()=>{
        try{
          if(req.result===undefined)throw new LearningPersistenceError('invalid','Profile not found.');
          const profile=decodeLearningProfile(req.result);
          const entries=(doc.islands as IslandDraft[]).map(d=>reviseIsland(null,profile,d));
          const ids=new Set(entries.map(x=>x.island.id));
          if(ids.size!==entries.length)throw new LearningPersistenceError('invalid','Duplicate Island IDs in import.');
          const store=tx.objectStore(CATALOGS);
          const existingRows=store.index('profileId').getAll(profileId);
          existingRows.onsuccess=()=>{
            try{
              const existing=(existingRows.result as unknown[]).map(decodeCatalogRow);
              const existingIds=new Set(existing.map(x=>x.island.id));
              if(entries.some(x=>existingIds.has(x.island.id)))
                throw new LearningPersistenceError('conflict',
                  'Imported Island already exists; nothing was imported.');
              catalogKeys(profile,[
                ...existing.filter(x=>!x.archived).map(x=>x.island),
                ...entries.map(x=>x.island)
              ]);
              proceed();
            }catch(cause){fail(cause);}
          };
          let index=0;
          const proceed=()=>{
            next();
          };
          const next=()=>{
            try{
              if(index===entries.length){complete(entries.length);return;}
              const entry=entries[index++];
              const key=catalogKey(profileId,entry.island.id);
              const check=store.get(key);
              check.onsuccess=()=>{
                try{
                  if(check.result!==undefined)
                    throw new LearningPersistenceError('conflict','Imported Island already exists; nothing was imported.');
                  store.add({key,profileId,content:entry} satisfies CatalogRow);
                  queueLocalMutation(tx, 'language-learning', key, 'upsert', { content: entry });
                  next();
                }catch(cause){fail(cause);}
              };
            }catch(cause){fail(cause);}
          };
          next();
        }catch(cause){fail(cause);}
      };
    });
  },
  async exportCatalog(profileId:string):Promise<string> {
    const content=await this.catalog(profileId,true);
    const encoded=JSON.stringify({format:'modu-language-catalog',version:1,
      islands:content.map(x=>({
        ...x.island,
        sentences:x.island.sentences.map(s=>({id:s.id,prompt:s.prompt,answer:s.answer})),
        vocabulary:x.vocabulary.map(v=>({id:v.id,sentenceId:v.sentenceId,term:v.term,meaning:v.meaning}))
      }))});
    if(new Blob([encoded]).size>MAX_CATALOG_LENGTH)
      throw new LearningPersistenceError('quota',
        'Catalog exceeds the 32 MiB template export limit. Use full learning backup.');
    return encoded;
  },
  latest(): Promise<BrowserPractice | null> {
    return transaction<BrowserPractice | null>([SESSIONS, META], 'readonly', (tx, complete, fail) => {
      const store = tx.objectStore(SESSIONS);
      const finish = (record: StoredPractice | null) => {
        const generation = tx.objectStore(META).get('epoch');
        generation.onsuccess = () => {
          try {
            const epoch: unknown = generation.result?.value ?? null;
            if (epoch !== null && typeof epoch !== 'string') {
              throw new LearningPersistenceError('corrupt', 'Invalid storage generation.');
            }
            complete(record ? {...record, storageEpoch: epoch as string | null} : null);
          } catch (cause) { fail(cause); }
        };
      };
      const pointer = tx.objectStore(META).get('latest');
      pointer.onsuccess = () => {
        try {
          const latest = pointer.result as {sessionId?: unknown} | undefined;
          if (latest) {
            if (typeof latest.sessionId !== 'string') {
              throw new LearningPersistenceError('corrupt', 'Invalid latest session pointer.');
            }
            const request = store.get(latest.sessionId);
            request.onsuccess = () => {
              try {
                const record = decodeSessionRow(request.result);
                if (!record) throw new LearningPersistenceError('corrupt', 'Latest session record is missing.');
                finish(record);
              } catch (cause) { fail(cause); }
            };
            return;
          }
          // Upgrade from legacy schema v1 with no pointer.
          const cursor = store.index('updatedAt').openCursor(null, 'prev');
          cursor.onsuccess = () => {
            try { finish(decodeSessionRow(cursor.result?.value)); }
            catch (cause) { fail(cause); }
          };
        } catch (cause) { fail(cause); }
      };
    });
  },
  get(sessionId: string): Promise<BrowserPractice | null> {
    return transaction<BrowserPractice | null>([SESSIONS, META], 'readonly', (tx, complete, fail) => {
      const request = tx.objectStore(SESSIONS).get(sessionId);
      request.onsuccess = () => {
        try {
          const record = decodeSessionRow(request.result);
          const generation = tx.objectStore(META).get('epoch');
          generation.onsuccess = () => {
            try {
              const epoch: unknown = generation.result?.value ?? null;
              if (epoch !== null && typeof epoch !== 'string') {
                throw new LearningPersistenceError('corrupt', 'Invalid storage generation.');
              }
              complete(record ? {...record, storageEpoch: epoch as string | null} : null);
            } catch (cause) { fail(cause); }
          };
        } catch (cause) { fail(cause); }
      };
    });
  },
  async execute(command: PracticeCommand, expectedRevision: number | null,
    expectedEpoch?: string | null, expectedCatalogRevision?:number): Promise<BrowserPractice> {
    await ensureMemoryInitialized();
    return transaction<BrowserPractice>([SESSIONS, ATTEMPTS, META, REVIEWS, CATALOGS, OUTBOX_STORE, SYNC_META_STORE], 'readwrite', (tx, complete, fail) => {
      const sessions = tx.objectStore(SESSIONS);
      const attempts = tx.objectStore(ATTEMPTS);
      const meta = tx.objectStore(META);
      const request = sessions.get(command.sessionId);
      request.onsuccess = () => {
        const generation = meta.get('epoch');
        generation.onsuccess = () => {
          try {
            const current = decodeSessionRow(request.result);
            const rawEpoch: unknown = generation.result?.value ?? null;
            if (rawEpoch !== null && typeof rawEpoch !== 'string') {
              throw new LearningPersistenceError('corrupt', 'Invalid storage generation.');
            }
            const epoch = rawEpoch as string | null;
            // Backup restoration creates a fresh generation. Old tabs must reload,
            // even when an imported session happens to have the same revision.
            if (expectedEpoch !== undefined && expectedEpoch !== epoch &&
              !(current === null && command.type === 'start' && expectedEpoch === null)) {
              throw new LearningPersistenceError('conflict',
                'Learning data was restored in another tab. Reload saved progress.');
            }
            if (current && (command.type === 'start' ||
              (command.type === 'attempt' && current.session.attempts.some(
                a => a.id === command.attempt.attemptId)))) {
              complete({...applyPracticeCommand(current, command).next, storageEpoch: epoch});
              return;
            }
            if ((current?.revision ?? null) !== expectedRevision) {
              throw new LearningPersistenceError('conflict',
                'Session changed in another tab. Reload saved progress.');
            }
            const commit = () => {
              try {
                const {next, attempt, changed} = applyPracticeCommand(current, command);
                if (!changed) { complete({...next, storageEpoch: epoch}); return; }
                const persist = (memory: MemoryState | null) => {
                  const effectiveEpoch = epoch ?? crypto.randomUUID();
                  const row: SessionRow = {id: next.session.id, updatedAt: Date.now(), record: next};
                  sessions.put(row);
                  if (attempt) attempts.add(attempt);
                  if (memory) tx.objectStore(REVIEWS).put(memory);
                  queueLocalMutation(tx, 'language-learning', next.session.id, 'command', {
                    command, attempt, session: next.session
                  }, expectedRevision === null ? null : String(expectedRevision));
                  if (epoch === null) meta.put({key: 'epoch', value: effectiveEpoch});
                  meta.put({key: 'latest', sessionId: next.session.id});
                  complete({...next, storageEpoch: effectiveEpoch});
                };
                if (attempt?.evidence.kind === 'recall') {
                  const key = memoryKey({
                    profileId: attempt.profileId, islandId: next.session.islandId,
                    sentenceId: attempt.sentenceId, sentenceRevision: attempt.sentenceRevision
                  });
                  const lookup = tx.objectStore(REVIEWS).get(key);
                  lookup.onsuccess = () => {
                    try {
                      const before = lookup.result === undefined ? null : decodeMemoryState(lookup.result);
                      persist(scheduleRatedAttempt(before, attempt, next.session.islandId));
                    } catch (cause) { fail(cause); }
                  };
                } else persist(null);
              } catch (cause) { fail(cause); }
            };
            if (command.type === 'attempt') {
              const existing = attempts.get(command.attempt.attemptId);
              existing.onsuccess = () => {
                if (existing.result !== undefined) {
                  fail(new LearningPersistenceError('conflict',
                    'Attempt ID belongs to an existing record. Reload saved progress.'));
                } else commit();
              };
            } else if(command.type==='start' && expectedCatalogRevision!==undefined) {
              const catalog=tx.objectStore(CATALOGS).get(catalogKey(command.profileId,command.island.id));
              catalog.onsuccess=()=>{
                try {
                  if(catalog.result===undefined)
                    throw new LearningPersistenceError('conflict','Island no longer exists in the catalog.');
                  const stored=decodeCatalogRow(catalog.result);
                  const active=stored.island;
                  if(stored.archived || active.revision!==expectedCatalogRevision ||
                    active.sourceLanguage!==command.island.sourceLanguage ||
                    active.targetLanguage!==command.island.targetLanguage ||
                    command.island.sentences.some(sentence=>{
                      const current=active.sentences.find(s=>s.id===sentence.id);
                      return !current || current.revision!==sentence.revision ||
                        current.prompt!==sentence.prompt || current.answer!==sentence.answer;
                    })) {
                    throw new LearningPersistenceError('conflict','Island changed. Refresh recommendations before starting.');
                  }
                  commit();
                }catch(cause){fail(cause);}
              };
            } else commit();
          } catch (cause) { fail(cause); }
        };
      };
    });
  },
  async exportBackup(): Promise<string> {
    await ensureCatalogInitialized();
    await ensureMemoryInitialized();
    const backup = await transaction<{records: StoredPractice[]; latestSessionId: string | null; reviews: MemoryState[];profiles:LearningProfile[];catalogs:ContentIsland[]}>(
      [SESSIONS, META, REVIEWS, PROFILES, CATALOGS], 'readonly', (tx, complete, fail) => {
        const request = tx.objectStore(SESSIONS).getAll();
        request.onsuccess = () => {
          try {
            const records = (request.result as unknown[]).map(raw => {
              const record = decodeSessionRow(raw);
              if (!record) throw new LearningPersistenceError('corrupt', 'Missing backup record.');
              return record;
            });
            const pointer = tx.objectStore(META).get('latest');
            pointer.onsuccess = () => {
              try {
                const latestSessionId = (pointer.result as {sessionId?: unknown} | undefined)?.sessionId
                  ?? (records.at(-1)?.session.id ?? null);
                if (latestSessionId !== null && (typeof latestSessionId !== 'string' ||
                  !records.some(r => r.session.id === latestSessionId))) {
                  throw new LearningPersistenceError('corrupt', 'Latest session pointer is invalid.');
                }
                const reviewRequest = tx.objectStore(REVIEWS).getAll();
                reviewRequest.onsuccess = () => {
                  try {
                    const reviews=(reviewRequest.result as unknown[]).map(decodeMemoryState);
                    const profileReq=tx.objectStore(PROFILES).getAll();
                    profileReq.onsuccess=()=>{
                      try {
                        const profiles=(profileReq.result as unknown[]).map(decodeLearningProfile);
                        const catalogReq=tx.objectStore(CATALOGS).getAll();
                        catalogReq.onsuccess=()=>{
                          try {
                            const catalogs=(catalogReq.result as unknown[]).map(decodeCatalogRow);
                            const profilesById=new Map(profiles.map(p=>[p.id,p]));
                            for(const entry of catalogs){
                              const profile=profilesById.get(entry.profileId);
                              if(!profile)throw new LearningPersistenceError('corrupt','Catalog profile is missing.');
                              validateContentIsland(entry,profile);
                            }
                            complete({records,latestSessionId,reviews,profiles,catalogs});
                          }catch(cause){fail(cause);}
                        };
                      }catch(cause){fail(cause);}
                    };
                  }catch(cause){fail(cause);}
                };
              } catch (cause) { fail(cause); }
            };
          } catch (cause) { fail(cause); }
        };
      }
    );
    const encoded = JSON.stringify({
      format: BACKUP_FORMAT, version: 3, exportedAt: new Date().toISOString(),
      sessions: backup.records, latestSessionId: backup.latestSessionId,
      reviews: backup.reviews, profiles: backup.profiles, catalogs: backup.catalogs
    } satisfies LearningBackup);
    if (new Blob([encoded]).size > MAX_BACKUP_LENGTH) {
      throw new LearningPersistenceError('quota', 'Learning history exceeds the backup size limit.');
    }
    return encoded;
  },
  async importBackup(text: string): Promise<void> {
    // Validate the entire source before opening the destructive transaction.
    const {records, attempts, reviews, latestSessionId,profiles,catalogs} = asBackup(text);
    await transaction<void>([SESSIONS, ATTEMPTS, META, REVIEWS, PROFILES, CATALOGS, OUTBOX_STORE, SYNC_META_STORE], 'readwrite', (tx, complete) => {
      const sessions = tx.objectStore(SESSIONS);
      const journal = tx.objectStore(ATTEMPTS);
      const meta = tx.objectStore(META);
      sessions.clear();
      journal.clear();
      meta.clear();
      const profileStore=tx.objectStore(PROFILES);
      const catalogStore=tx.objectStore(CATALOGS);
      profileStore.clear();
      catalogStore.clear();
      const reviewStore = tx.objectStore(REVIEWS);
      reviewStore.clear();
      const now = Date.now();
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        sessions.add({id: record.session.id, record, updatedAt: now + i} satisfies SessionRow);
      }
      for (const attempt of attempts) journal.add(attempt);
      for (const state of reviews) reviewStore.add(state);
      for(const profile of profiles)profileStore.add(profile);
      for(const content of catalogs)catalogStore.add({
        key:catalogKey(content.profileId,content.island.id),profileId:content.profileId,content
      } satisfies CatalogRow);
      meta.put({key:'catalogSeedV1',done:true});
      meta.put({key:'memoryBootstrapV1', done:true});
      if (latestSessionId !== null) meta.put({key: 'latest', sessionId: latestSessionId});
      meta.put({key: 'epoch', value: crypto.randomUUID()});
      resetCaptureAfterRestore(tx);
      complete(undefined);
    });
  },
  /** One consistent browser snapshot; never use a limited due queue as the
   * source for joining current content, because stale revisions could crowd it. */
  async planStored(profile:LearningProfile,options:PlanOptions):Promise<{
    plan:LearningPlan; islands:LanguageIsland[];
  }> {
    const expected=decodeLearningProfile(profile);
    await ensureCatalogInitialized();
    await ensureMemoryInitialized();
    return transaction<{plan:LearningPlan;islands:LanguageIsland[]}>([PROFILES,CATALOGS,REVIEWS],'readonly',
      (tx,complete,fail)=>{
        const loaded=tx.objectStore(PROFILES).get(expected.id);
        loaded.onsuccess=()=>{
          try{
            if(loaded.result===undefined)throw new LearningPersistenceError('invalid','Language profile not found.');
            const stored=decodeLearningProfile(loaded.result);
            if(stored.targetLanguage!==expected.targetLanguage)
              throw new LearningPersistenceError('conflict','Language profile changed.');
            const catalogs=tx.objectStore(CATALOGS).index('profileId').getAll(expected.id);
            catalogs.onsuccess=()=>{
              try{
                const all=(catalogs.result as unknown[]).map(decodeCatalogRow);
                for(const item of all)validateContentIsland(item,stored);
                const islands=all.filter(x=>!x.archived).map(x=>x.island);
                const range=IDBKeyRange.bound([expected.id,0],[expected.id,8_640_000_000_000_000]);
                const reviews=tx.objectStore(REVIEWS).index('profileDue').getAll(range);
                reviews.onsuccess=()=>{
                  try{complete({plan:createLearningPlan({profile:stored,islands,
                    states:(reviews.result as unknown[]).map(decodeMemoryState),options}),islands});}
                  catch(cause){fail(cause);}
                };
              }catch(cause){fail(cause);}
            };
          }catch(cause){fail(cause);}
        };
      });
  },
  async plan(profile: LearningProfile, islands: readonly LanguageIsland[],
    options: PlanOptions): Promise<LearningPlan> {
    // Validate the external catalog before touching storage.
    try { catalogKeys(profile, islands); }
    catch (cause) { throw translateError(cause); }
    await ensureMemoryInitialized();
    return transaction<LearningPlan>([REVIEWS], 'readonly', (tx, complete, fail) => {
      const range = IDBKeyRange.bound([profile.id, 0],[profile.id, 8_640_000_000_000_000]);
      const request = tx.objectStore(REVIEWS).index('profileDue').getAll(range);
      request.onsuccess = () => {
        try {
          complete(createLearningPlan({
            profile, islands,
            states:(request.result as unknown[]).map(decodeMemoryState),
            options
          }));
        } catch (cause) { fail(cause); }
      };
    });
  },
  async getMemory(profileId: string, islandId: string,
    sentenceId: string, sentenceRevision: number): Promise<MemoryState | null> {
    await ensureMemoryInitialized();
    const key = memoryKey({profileId,islandId,sentenceId,sentenceRevision});
    return transaction<MemoryState | null>([REVIEWS], 'readonly', (tx, complete, fail) => {
      const request = tx.objectStore(REVIEWS).get(key);
      request.onsuccess = () => {
        try { complete(request.result === undefined ? null : decodeMemoryState(request.result)); }
        catch (cause) { fail(cause); }
      };
    });
  },
  async due(profileId: string, now: number, limit = 50): Promise<MemoryState[]> {
    if (!profileId.trim() || !Number.isSafeInteger(now) || now < 0 ||
      now > 8_640_000_000_000_000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new LearningPersistenceError('invalid', 'Invalid review profile, clock or limit.');
    }
    await ensureMemoryInitialized();
    return transaction<MemoryState[]>([REVIEWS], 'readonly', (tx, complete, fail) => {
      const range = IDBKeyRange.bound([profileId, 0], [profileId, now]);
      const request = tx.objectStore(REVIEWS).index('profileDue').openCursor(range);
      const found: MemoryState[] = [];
      request.onsuccess = () => {
        try {
          const cursor = request.result;
          if (!cursor || found.length >= limit) { complete(found); return; }
          const state = decodeMemoryState(cursor.value);
          if (state.profileId !== profileId || state.dueAt > now) {
            throw new LearningPersistenceError('corrupt', 'Review index does not match its data.');
          }
          found.push(state);
          if (found.length >= limit) complete(found);
          else cursor.continue();
        } catch (cause) { fail(cause); }
      };
    });
  },
  /** One readonly snapshot of committed sessions, SRS and active content.
   * Attempts are not tallied from playback events or independent counters. */
  async progress(profile:LearningProfile,now:number):Promise<LearningProgress> {
    const requested=decodeLearningProfile(profile);
    await ensureCatalogInitialized();
    await ensureMemoryInitialized();
    return transaction<LearningProgress>([PROFILES,SESSIONS,REVIEWS,CATALOGS],
      'readonly',(tx,complete,fail)=>{
        const profileReq=tx.objectStore(PROFILES).get(requested.id);
        profileReq.onsuccess=()=>{
          try{
            if(profileReq.result===undefined)
              throw new LearningPersistenceError('invalid','Language profile was not found.');
            const stored=decodeLearningProfile(profileReq.result);
            if(stored.targetLanguage!==requested.targetLanguage)
              throw new LearningPersistenceError('conflict','Language profile changed.');
            const historyReq=tx.objectStore(SESSIONS).getAll();
            historyReq.onsuccess=()=>{
              try{
                const records=(historyReq.result as unknown[]).map(decodeSessionRow);
                if(records.some(x=>x===null))
                  throw new LearningPersistenceError('corrupt','Missing historical session.');
                const catalogReq=tx.objectStore(CATALOGS).index('profileId').getAll(requested.id);
                catalogReq.onsuccess=()=>{
                  try{
                    const catalog=(catalogReq.result as unknown[]).map(decodeCatalogRow);
                    for(const entry of catalog)validateContentIsland(entry,stored);
                    const islands=catalog.filter(x=>!x.archived).map(x=>x.island);
                    const range=IDBKeyRange.bound([requested.id,0],
                      [requested.id,8_640_000_000_000_000]);
                    const reviewReq=tx.objectStore(REVIEWS).index('profileDue').getAll(range);
                    reviewReq.onsuccess=()=>{
                      try{
                        complete(projectLearningProgress({
                          profile:stored,records:records as StoredPractice[],
                          states:(reviewReq.result as unknown[]).map(decodeMemoryState),
                          islands,now
                        }));
                      }catch(cause){fail(cause);}
                    };
                  }catch(cause){fail(cause);}
                };
              }catch(cause){fail(cause);}
            };
          }catch(cause){fail(cause);}
        };
      });
  },
  async persistenceStatus(): Promise<'granted' | 'not-granted' | 'unavailable'> {
    if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return 'unavailable';
    try { return await navigator.storage.persisted() ? 'granted' : 'not-granted'; }
    catch { return 'unavailable'; }
  },
  async requestPersistence(): Promise<'granted' | 'not-granted' | 'unavailable'> {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unavailable';
    try { return await navigator.storage.persist() ? 'granted' : 'not-granted'; }
    catch { return 'unavailable'; }
  }
};
