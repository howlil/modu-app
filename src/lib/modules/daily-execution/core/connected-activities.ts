import type { ExecutionState, ExecutionTask } from './planning.ts';

export type SourceProvider = 'github' | 'import' | 'link' | 'google-tasks';
export type RemoteStatus = 'open' | 'completed' | 'unavailable' | 'unknown';
export type ConnectionStatus = 'idle' | 'up-to-date' | 'offline' | 'error' | 'paused';

export interface SourceReference {
  providerId: SourceProvider;
  connectionId: string;
  externalId: string;
  url?: string;
  remoteTitle?: string;
  remoteStatus: RemoteStatus;
  lastSyncedAt?: number;
}

export interface SourceConnection {
  id: string;
  providerId: SourceProvider;
  label: string;
  repository?: string;
  status: ConnectionStatus;
  lastSyncedAt?: number;
  error?: string;
}

export interface SourceCandidate {
  source: SourceReference;
  title: string;
  dueDate?: string;
}

export function sourceIdentity(source: Pick<SourceReference,'providerId'|'connectionId'|'externalId'>): string {
  return JSON.stringify([source.providerId,source.connectionId,source.externalId]);
}

export function validatePublicUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hostname === '' || url.port) return;
    return url.href.slice(0,2048);
  } catch { return; }
}

export function isSourceReference(value: unknown): value is SourceReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as Partial<SourceReference>;
  return ['github','import','link','google-tasks'].includes(s.providerId ?? '') &&
    typeof s.connectionId === 'string' && s.connectionId.length > 0 && s.connectionId.length <= 180 &&
    typeof s.externalId === 'string' && s.externalId.length > 0 && s.externalId.length <= 256 &&
    ['open','completed','unavailable','unknown'].includes(s.remoteStatus ?? '') &&
    (s.url === undefined || (typeof s.url === 'string' && validatePublicUrl(s.url) === s.url)) &&
    (s.remoteTitle === undefined || (typeof s.remoteTitle === 'string' && s.remoteTitle.length <= 160)) &&
    (s.lastSyncedAt === undefined || (Number.isFinite(s.lastSyncedAt) && s.lastSyncedAt! >= 0));
}

export function isSourceConnection(value: unknown): value is SourceConnection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const c = value as Partial<SourceConnection>;
  return typeof c.id === 'string' && c.id.length > 0 && c.id.length <= 180 &&
    ['github','import','link','google-tasks'].includes(c.providerId ?? '') &&
    typeof c.label === 'string' && c.label.length <= 160 &&
    ['idle','up-to-date','offline','error','paused'].includes(c.status ?? '') &&
    (c.repository === undefined || (typeof c.repository === 'string' && /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(c.repository))) &&
    (c.lastSyncedAt === undefined || (Number.isFinite(c.lastSyncedAt) && c.lastSyncedAt! >= 0)) &&
    (c.error === undefined || (typeof c.error === 'string' && c.error.length <= 240));
}

export function isSourceCandidate(value: unknown): value is SourceCandidate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const c = value as Partial<SourceCandidate>;
  return isSourceReference(c.source) &&
    typeof c.title === 'string' && c.title.trim().length > 0 && c.title.length <= 160 &&
    (c.dueDate === undefined || (typeof c.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.dueDate)));
}

export function findLinkedTask(state: ExecutionState, ref: SourceReference): ExecutionTask | undefined {
  const identity = sourceIdentity(ref);
  return state.tasks.find(t => t.source && sourceIdentity(t.source) === identity);
}

/** Do not copy provider completion state onto Modu's local completion. */
export function linkActivity(state: ExecutionState, candidate: SourceCandidate, id: string, now: number):
  {state: ExecutionState; taskId: string} {
  const previous = findLinkedTask(state,candidate.source);
  if (previous) return { state, taskId: previous.id };
  if (!id || state.tasks.some(t=>t.id===id)) throw new Error('Linked task requires a unique local ID.');
  const task: ExecutionTask = {
    id, title: candidate.title.slice(0,120), nextAction: '', workstream:'general',
    impact:'medium', estimateMinutes:0, status:'ready', createdAt:now,
    ...(candidate.dueDate?{dueDate:candidate.dueDate}:{}),
    source:{...candidate.source,remoteTitle:candidate.title.slice(0,160)}
  };
  return {state:{...state,tasks:[...state.tasks,task]},taskId:id};
}

export function detachActivity(state:ExecutionState, id:string):ExecutionState {
  const task=state.tasks.find(t=>t.id===id);
  if (!task?.source) return state;
  return {...state,tasks:state.tasks.map(t=>{
    if(t.id!==id)return t;
    const {source: _source,...rest}=t;
    return rest;
  })};
}

/** Atomic full-snapshot reconciliation; a missing GitHub issue is not a deletion assertion. */
export function reconcileSource(
  state:ExecutionState, connection:SourceConnection,
  remoteItems:SourceCandidate[], now:number, incremental=false
):ExecutionState {
  const unique=new Map<string,SourceCandidate>();
  for(const item of remoteItems) {
    if (!isSourceCandidate(item) || item.source.connectionId!==connection.id ||
      item.source.providerId!==connection.providerId) throw new Error('Invalid source item.');
    unique.set(sourceIdentity(item.source),item);
  }
  const byKey=new Map(unique);
  const other=state.sourceItems.filter(item=>item.source.connectionId!==connection.id);
  const kept=incremental?state.sourceItems.filter(item=>item.source.connectionId===connection.id &&
    !byKey.has(sourceIdentity(item.source))):[];
  if(other.length+kept.length+unique.size>1500)throw new Error('Too many cached activities (limit 1500).');
  const tasks=state.tasks.map(t=>{
    if(!t.source || t.source.connectionId!==connection.id)return t;
    const fresh=byKey.get(sourceIdentity(t.source));
    if(!fresh)return t;
    // Update provider-owned title only while Modu's title still matches the previous provider snapshot.
    // A user-edited title is an implicit local override and must survive future refreshes.
    const original=(t.source.remoteTitle??t.title).slice(0,120);
    return {...t,...(t.title===original?{title:fresh.title.slice(0,120)}:{}),
      source:{...fresh.source,lastSyncedAt:now,remoteTitle:fresh.title.slice(0,160)}};
  });
  const synced:SourceConnection={...connection,status:'up-to-date',error:undefined,lastSyncedAt:now};
  return {...state,tasks,sourceConnections:[
    ...state.sourceConnections.filter(c=>c.id!==connection.id),synced
  ],sourceItems:[...other,...kept,...[...byKey.values()].map(item=>({
    ...item,source:{...item.source,lastSyncedAt:now}
  }))]};
}

export function disconnectSource(state:ExecutionState,id:string):ExecutionState {
  return {...state,sourceConnections:state.sourceConnections.filter(c=>c.id!==id),
    sourceItems:state.sourceItems.filter(item=>item.source.connectionId!==id)};
}

export function sourceCandidates(state:ExecutionState):SourceCandidate[] {
  const linked=new Set(state.tasks.filter(t=>t.source).map(t=>sourceIdentity(t.source!)));
  return state.sourceItems.filter(item=>!linked.has(sourceIdentity(item.source)));
}
