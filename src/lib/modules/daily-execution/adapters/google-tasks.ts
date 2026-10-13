import { isSourceCandidate, type SourceCandidate } from '../core/connected-activities.ts';

export interface GoogleConnectionStatus {
  available: boolean;
  connected: boolean;
  connectionId?: string;
}

async function data(response: Response): Promise<Record<string,unknown>> {
  let payload:unknown;
  try { payload=await response.json(); } catch { throw new Error('Invalid Google Tasks response.'); }
  if(!payload || typeof payload!=='object' || Array.isArray(payload))throw new Error('Invalid Google Tasks response.');
  if(!response.ok) {
    const message=(payload as Record<string,unknown>).error;
    throw new Error(typeof message==='string'?message:'Google Tasks is temporarily unavailable.');
  }
  return payload as Record<string,unknown>;
}

export async function googleConnectionStatus(fetcher:typeof fetch=fetch):Promise<GoogleConnectionStatus> {
  const payload=await data(await fetcher('/api/daily/google/status',{credentials:'same-origin',cache:'no-store'}));
  return {
    available:payload.available===true,
    connected:payload.connected===true,
    ...(typeof payload.connectionId==='string'?{connectionId:payload.connectionId}:{})
  };
}
export async function beginGoogleConnection(fetcher:typeof fetch=fetch):Promise<string> {
  const payload=await data(await fetcher('/api/daily/google/start',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'content-type':'application/json'},body:'{}'
  }));
  const url=payload.authorizationUrl;
  if(typeof url!=='string')throw new Error('Google sign-in URL is missing.');
  const target=new URL(url);
  if(target.protocol!=='https:' || target.hostname!=='accounts.google.com' ||
    target.pathname!=='/o/oauth2/v2/auth')throw new Error('Invalid Google sign-in URL.');
  return target.href;
}
export async function fetchGoogleActivities(fetcher:typeof fetch=fetch):
  Promise<{connectionId:string;items:SourceCandidate[]}> {
  const payload=await data(await fetcher('/api/daily/google/tasks',{credentials:'same-origin',cache:'no-store'}));
  if(typeof payload.connectionId!=='string'||!payload.connectionId.startsWith('google-tasks:') ||
    !Array.isArray(payload.items) || payload.items.length>1000 ||
    payload.items.some(item=>!isSourceCandidate(item) ||
      item.source.providerId!=='google-tasks' || item.source.connectionId!==payload.connectionId))
    throw new Error('Google Tasks returned invalid linked activities.');
  return {connectionId:payload.connectionId,items:payload.items as SourceCandidate[]};
}
export async function revokeGoogleConnection(fetcher:typeof fetch=fetch):Promise<void> {
  await data(await fetcher('/api/daily/google/disconnect',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'content-type':'application/json'},body:'{}'
  }));
}
