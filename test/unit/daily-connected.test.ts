import {afterEach,describe,expect,it,vi} from 'vitest';
import {emptyExecutionState,selectForDay,currentForDay,type ExecutionTask} from '../../src/lib/modules/daily-execution/core/planning.ts';
import {sourceIdentity,linkActivity,detachActivity,reconcileSource,disconnectSource,sourceCandidates,isSourceReference,
  type SourceCandidate,type SourceConnection} from '../../src/lib/modules/daily-execution/core/connected-activities.ts';
import {readExecutionSnapshot,saveExecutionStateIfCurrent} from '../../src/lib/modules/daily-execution/adapters/persistence.ts';
import {githubConnection,githubRepository,loadPublicGithubIssues} from '../../src/lib/modules/daily-execution/adapters/github-issues.ts';
import {manualSource,parseActivityFile} from '../../src/lib/modules/daily-execution/adapters/source-import.ts';

const connection:SourceConnection={id:'github:openai/test',providerId:'github',label:'openai/test',
  repository:'openai/test',status:'idle'};
function item(id='42', title='Review issue'):SourceCandidate {
  return {title,source:{providerId:'github',connectionId:connection.id,externalId:id,
    url:'https://github.com/openai/test/issues/'+id,remoteStatus:'open'}};
}
function storage() {
 const entries=new Map<string,string>();
 vi.stubGlobal('localStorage',{getItem:(k:string)=>entries.get(k)??null,
  setItem:(k:string,v:string)=>{entries.set(k,v);},removeItem:(k:string)=>entries.delete(k)});
 return entries;
}
afterEach(()=>vi.unstubAllGlobals());

describe('M3 connected activities',()=>{
 it('uses compound identity to prevent cross-account and cross-provider collisions',()=>{
  const a=item();
  expect(sourceIdentity(a.source)).not.toBe(sourceIdentity({...a.source,connectionId:'github:other/test'}));
  expect(sourceIdentity(a.source)).not.toBe(sourceIdentity({...a.source,providerId:'import'}));
  expect(isSourceReference({...a.source,url:'javascript:alert(1)'})).toBe(false);
 });
 it('links exactly once, preserves stable task ID and never syncs local completion upstream',()=>{
  const state={...emptyExecutionState(),sourceConnections:[connection],sourceItems:[item()]};
  const first=linkActivity(state,item(),'local-uuid',100);
  const second=linkActivity(first.state,item(),'unused-id',200);
  expect(second.taskId).toBe('local-uuid');
  expect(second.state).toBe(first.state);
  const today=selectForDay(first.state,first.taskId,'2026-10-13');
  expect(currentForDay(today,'2026-10-13')?.id).toBe('local-uuid');
  const completed={...today,tasks:today.tasks.map(t=>({...t,status:'done' as const,completedAt:200}))};
  const next=reconcileSource(completed,connection,[{...item(),source:{...item().source,remoteStatus:'completed'}}],300);
  expect(next.tasks[0].status).toBe('done');
  expect(next.tasks[0].id).toBe('local-uuid');
  expect(next.tasks[0].completedAt).toBe(200);
  expect(next.tasks[0].source?.remoteStatus).toBe('completed');
  expect(today.days['2026-10-13'].taskIds).toEqual(['local-uuid']);
 });
 it('updates unchanged remote titles but preserves user-edited local titles',()=>{
  const seed={...emptyExecutionState(),sourceConnections:[connection],sourceItems:[item()]};
  const linked=linkActivity(seed,item(),'local-1',1).state;
  const first=reconcileSource(linked,connection,[item('42','Updated by provider')],100);
  expect(first.tasks[0].title).toBe('Updated by provider');
  const modified={...first,tasks:[{...first.tasks[0],title:'My personal shorthand'}]};
  const second=reconcileSource(modified,connection,[item('42','Updated again')],200);
  expect(second.tasks[0].title).toBe('My personal shorthand');
  expect(second.tasks[0].source?.remoteTitle).toBe('Updated again');
  expect(linked.tasks[0].title).toBe('Review issue');
 });
 it('disconnects or detaches without deleting task, checkpoint, Today, or history',()=>{
  const seed={...emptyExecutionState(),sourceConnections:[connection],sourceItems:[item()]};
  const linked=linkActivity(seed,item(),'linked-one',1).state;
  const marked={...linked,tasks:linked.tasks.map(t=>({...t,
    checkpoint:{lastCompleted:'part',blocker:'',nextAction:'continue',updatedAt:1}
  }))};
  const selected=selectForDay(marked,'linked-one','2026-10-13');
  const disconnected=disconnectSource(selected,connection.id);
  expect(disconnected.sourceConnections).toHaveLength(0);
  expect(disconnected.tasks[0].source).toBeDefined();
  const detached=detachActivity(disconnected,'linked-one');
  expect(detached.tasks[0].source).toBeUndefined();
  expect(detached.tasks[0].checkpoint?.nextAction).toBe('continue');
  expect(detached.days['2026-10-13'].taskIds).toEqual(['linked-one']);
 });
 it('reconciles only after a full valid snapshot and retains absent linked records',()=>{
  const seed={...emptyExecutionState(),sourceConnections:[connection],sourceItems:[item()]};
  const state=linkActivity(seed,item(),'local-1',1).state;
  expect(()=>reconcileSource(state,connection,[{...item(),source:{...item().source,connectionId:'import:wrong'}}],3)).toThrow();
  const refreshed=reconcileSource(state,connection,[item('43','Different')],4);
  expect(refreshed.tasks[0].source?.remoteStatus).toBe('open');
  expect(refreshed.sourceItems.map(x=>x.source.externalId)).toEqual(['43']);
  expect(sourceCandidates(refreshed).map(x=>x.source.externalId)).toEqual(['43']);
 });
 it('incremental reconciliation retains unchanged candidates and updates changed remote status',()=>{
  const state={...emptyExecutionState(),sourceConnections:[{...connection,lastSyncedAt:1000}],
    sourceItems:[item('1','Original'),item('2','Other')]};
  const updated=reconcileSource(state,state.sourceConnections[0],[{
    ...item('1','Changed'),source:{...item('1').source,remoteStatus:'completed'}
  }],2000,true);
  expect(updated.sourceItems.map(x=>x.source.externalId)).toEqual(['2','1']);
  expect(updated.sourceItems.find(x=>x.source.externalId==='1')?.source.remoteStatus).toBe('completed');
  expect(updated.sourceItems.find(x=>x.source.externalId==='2')?.title).toBe('Other');
  expect(updated.sourceConnections[0].lastSyncedAt).toBe(2000);
  expect(state.sourceItems[0].title).toBe('Original');
 });
 it('rejects over-limit snapshots without partial local mutation',()=>{
  const state={...emptyExecutionState(),sourceConnections:[connection]};
  const items=Array.from({length:1501},(_,i)=>item(String(i)));
  expect(()=>reconcileSource(state,connection,items,100)).toThrow('Too many cached');
  expect(state.sourceItems).toHaveLength(0);
 });

 it('roundtrips linked records in legacy localStorage without overwriting legacy fields',()=>{
  const entries=storage();
  const initial={...emptyExecutionState(),goal:'unchanged',sourceConnections:[connection],sourceItems:[item()]};
  const linked=linkActivity(initial,item(),'linked-1',1).state;
  saveExecutionStateIfCurrent(linked,null);
  const restored=readExecutionSnapshot().state;
  expect(restored.goal).toBe('unchanged');
  expect(restored.tasks[0].source?.externalId).toBe('42');
  expect(restored.sourceConnections[0].id).toBe(connection.id);
  const original=entries.get('modu-daily-execution-v1')!;
  entries.set('modu-daily-execution-v1',JSON.stringify({...linked,tasks:[{...linked.tasks[0],source:{...item().source,url:'http://unsafe.invalid'}}]}));
  expect(()=>readExecutionSnapshot()).toThrow('Invalid linked activity');
  expect(entries.get('modu-daily-execution-v1')).not.toBe(original);
 });
});

describe('M3 import and public adapter',()=>{
 it('normalizes public GitHub names and rejects invalid repositories',()=>{
  expect(githubRepository('https://github.com/OpenAI/TEST/')).toBe('openai/test');
  expect(githubConnection('OpenAI/TEST').id).toBe('github:openai/test');
  expect(()=>githubRepository('private/repo/extra')).toThrow();
 });
 it('filters pull requests, paginates, maps closed status and does not require tokens',async()=>{
  const fetched:string[]=[];
  const fetcher=vi.fn(async (url:string,options:RequestInit)=>{
   fetched.push(url);
   expect((options.headers as Record<string,string>).Authorization).toBeUndefined();
   const page=Number(new URL(url).searchParams.get('page'));
   const issues=page===1?[
    ...Array.from({length:99},(_,i)=>({number:i+1,title:'Issue '+i,state:'open',html_url:'https://github.com/openai/test/issues/'+(i+1)})),
    {number:100,title:'PR',state:'open',html_url:'https://github.com/openai/test/pull/100',pull_request:{}}
   ]:[{number:101,title:'Closed',state:'closed',html_url:'https://github.com/openai/test/issues/101'}];
   return {ok:true,json:async()=>issues} as Response;
  });
  const result=await loadPublicGithubIssues(connection,undefined,fetcher as typeof fetch);
  expect(fetched).toHaveLength(2);
  expect(result).toHaveLength(100);
  expect(result.find(x=>x.source.externalId==='101')?.source.remoteStatus).toBe('completed');
 });
 it('adds since parameter only to subsequent complete refreshes',async()=>{
  const requested:string[]=[];
  const fetcher=vi.fn(async (url:string)=>{
    requested.push(url);
    return {ok:true,json:async()=>[]} as Response;
  });
  await loadPublicGithubIssues(connection,undefined,fetcher as typeof fetch);
  await loadPublicGithubIssues({...connection,lastSyncedAt:600_000},undefined,fetcher as typeof fetch);
  expect(new URL(requested[0]).searchParams.has('since')).toBe(false);
  expect(new URL(requested[1]).searchParams.get('since')).toBe(new Date(480_000).toISOString());
 });

 it('leaves an old source snapshot intact on partial fetch failure',async()=>{
  const fetcher=vi.fn(async()=>({ok:false,status:429} as Response));
  await expect(loadPublicGithubIssues(connection,undefined,fetcher as typeof fetch))
    .rejects.toThrow('limited or denied');
 });
 it('validates JSON import bounds and manual HTTPS links',async()=>{
  const file={name:'my.json',size:100,text:async()=>JSON.stringify([{id:'a',title:'Write a letter',status:'open'}])};
  const result=await parseActivityFile(file);
  expect(result.connection.id).toBe('import:my.json');
  expect(result.items[0].title).toBe('Write a letter');
  const manual=manualSource('Read the documentation','https://example.com/docs');
  expect(manual.item.source.remoteStatus).toBe('unknown');
  expect(()=>manualSource('task','http://example.com')).toThrow();
  await expect(parseActivityFile({...file,text:async()=>JSON.stringify([{id:'x',title:'first'},{id:'x',title:'second'}])}))
    .rejects.toThrow('Duplicate');
 });
});
