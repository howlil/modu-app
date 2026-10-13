import {afterEach, describe, expect, it, vi} from 'vitest';
import {emptyExecutionState, selectForDay, type ExecutionTask} from '../../src/lib/modules/daily-execution/core/planning.ts';
import {readExecutionSnapshot, saveExecutionStateIfCurrent, isSafeReferenceUrl, DAILY_STORAGE_KEY} from '../../src/lib/modules/daily-execution/adapters/persistence.ts';

function memoryStorage() {
  const entries = new Map<string,string>();
  vi.stubGlobal('localStorage',{
    getItem:(key:string)=>entries.get(key)??null,
    setItem:(key:string,value:string)=>{ entries.set(key,value); },
    removeItem:(key:string)=>entries.delete(key)
  });
  return entries;
}
function task(id:string):ExecutionTask {
  return {id,title:'Review requirements',nextAction:'Continue the draft',workstream:'general',
    impact:'medium',estimateMinutes:0,status:'ready',createdAt:1234,
    checkpoint:{lastCompleted:'Outline',blocker:'',nextAction:'Review next section',updatedAt:1235}};
}
afterEach(()=>vi.unstubAllGlobals());

describe('Daily M3 rollback migration',()=>{
  it('restores selected linked tasks as local without losing IDs, Today, status or checkpoints',()=>{
    const storage=memoryStorage();
    const existing=selectForDay({...emptyExecutionState(),tasks:[task('stable-id')]},'stable-id','2026-10-13');
    const original={
      ...existing,
      sourceConnections:[{id:'github:demo/repo',providerId:'github',label:'demo/repo',status:'up-to-date'}],
      sourceItems:[{title:'Unselected candidate',source:{providerId:'github',connectionId:'github:demo/repo',externalId:'8',remoteStatus:'open'}}],
      tasks:[{...task('stable-id'),source:{providerId:'github',connectionId:'github:demo/repo',
        externalId:'42',remoteStatus:'completed',url:'https://github.com/demo/repo/issues/42'}}]
    };
    const raw=JSON.stringify(original);
    storage.set(DAILY_STORAGE_KEY,raw);
    const result=readExecutionSnapshot();
    expect(storage.get(DAILY_STORAGE_KEY)).toBe(raw);
    expect(result.state.tasks).toHaveLength(1);
    expect(result.state.tasks[0]).toMatchObject({
      id:'stable-id',status:'ready',referenceUrl:'https://github.com/demo/repo/issues/42',
      checkpoint:{nextAction:'Review next section'}
    });
    expect(result.state.days['2026-10-13'].taskIds).toEqual(['stable-id']);
    expect(result.state.tasks[0]).not.toHaveProperty('source');
    expect(result.state).not.toHaveProperty('sourceConnections');
    expect(result.state).not.toHaveProperty('sourceItems');
    const saved=saveExecutionStateIfCurrent(result.state,result.raw);
    expect(saved).not.toContain('sourceConnections');
    expect(saved).not.toContain('sourceItems');
    expect(saved).not.toContain('"source":');
    expect(readExecutionSnapshot().state.tasks[0].id).toBe('stable-id');
  });
  it('retains completed status and progress history for old Google-linked activities',()=>{
    const storage=memoryStorage();
    const legacy={...emptyExecutionState(),manualEntries:[{
      id:'work-1',taskId:'google-task-1',startedAt:1000,endedAt:2000
    }],tasks:[{...task('google-task-1'),status:'done',completedAt:5000,
      outcome:'Finished local review',
      source:{providerId:'google-tasks',connectionId:'google-tasks:old-session',
        externalId:'[\"list\",\"task\"]',remoteStatus:'open'}}]};
    storage.set(DAILY_STORAGE_KEY,JSON.stringify(legacy));
    const restored=readExecutionSnapshot().state;
    expect(restored.tasks[0].status).toBe('done');
    expect(restored.tasks[0].completedAt).toBe(5000);
    expect(restored.tasks[0].outcome).toBe('Finished local review');
    expect(restored.tasks[0].checkpoint?.lastCompleted).toBe('Outline');
    expect(restored.manualEntries[0].taskId).toBe('google-task-1');
    expect(restored.tasks[0]).not.toHaveProperty('source');
  });
  it('keeps an existing local reference when legacy source also has a URL',()=>{
    const storage=memoryStorage();
    const original={...emptyExecutionState(),tasks:[{
      ...task('a'),referenceUrl:'https://example.com/my-note',
      source:{providerId:'link',connectionId:'link:manual',externalId:'x',
        url:'https://example.com/original',remoteStatus:'open'}
    }]};
    storage.set(DAILY_STORAGE_KEY,JSON.stringify(original));
    expect(readExecutionSnapshot().state.tasks[0].referenceUrl).toBe('https://example.com/my-note');
  });
  it('discards unsafe legacy link metadata rather than exposing it in the UI',()=>{
    const storage=memoryStorage();
    storage.set(DAILY_STORAGE_KEY,JSON.stringify({
      ...emptyExecutionState(),tasks:[{
        ...task('legacy'),source:{url:'javascript:alert(1)',remoteStatus:'open'}
      }]
    }));
    expect(readExecutionSnapshot().state.tasks[0].referenceUrl).toBeUndefined();
    expect(isSafeReferenceUrl('https://example.com/reference')).toBe(true);
    expect(isSafeReferenceUrl('https://user:pass@example.com/private')).toBe(false);
    expect(isSafeReferenceUrl('http://example.com/private')).toBe(false);
  });
  it('still rejects broken task snapshots without overwriting user storage',()=>{
    const storage=memoryStorage();
    const raw='{"tasks":[{"id":"a","title":14}]}';
    storage.set(DAILY_STORAGE_KEY,raw);
    expect(()=>readExecutionSnapshot()).toThrow('Invalid Daily tasks');
    expect(storage.get(DAILY_STORAGE_KEY)).toBe(raw);
  });
});
