import { env } from 'cloudflare:workers';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  browserCookieSettings, decryptSecret, encryptSecret, googleOAuthConfig,
  hashSecret, originAllowed, randomSecret, type GoogleOAuthConfig, type GoogleOAuthEnv
} from '#lib/server/daily-google-security.ts';

const COOKIE = 'modu_daily_google_session';
const COOKIE_LIFETIME = 30 * 24 * 60 * 60;
const OAUTH_TTL = 10 * 60;
const SCOPE = 'https://www.googleapis.com/auth/tasks.readonly';
const noStore = { 'cache-control':'no-store', 'referrer-policy':'no-referrer' };
type Session = { expires_at:number };
type Flow = { verifier_ciphertext:string };
type StoredToken = { connection_id:string;refresh_token_ciphertext:string };
type GoogleTokenResponse = { access_token?:string;refresh_token?:string };
type GoogleTask = { id?:unknown; title?:unknown; status?:unknown; due?:unknown; deleted?:unknown };
type GoogleList = { id?:unknown };
function configured(origin:string) {
  return googleOAuthConfig(env as unknown as Parameters<typeof googleOAuthConfig>[0],origin);
}
function reply(payload:unknown,status=200) {
  return json(payload,{status,headers:noStore});
}
function failure(reason:string,code:number) { return reply({error:reason},code); }
async function owner(config:GoogleOAuthConfig, token:string|undefined):Promise<string|null> {
  if(!token || !/^[A-Za-z0-9_-]{43}$/.test(token))return null;
  const hash=await hashSecret(token);
  const session=await config.db.prepare(
    'SELECT expires_at FROM daily_oauth_sessions WHERE owner_hash = ?'
  ).bind(hash).first<Session>();
  return session?.expires_at && session.expires_at>Math.floor(Date.now()/1000)?hash:null;
}
async function tokenRow(config:GoogleOAuthConfig, hash:string):Promise<StoredToken|null> {
  return config.db.prepare('SELECT connection_id,refresh_token_ciphertext FROM daily_google_tokens WHERE owner_hash = ?')
    .bind(hash).first<StoredToken>();
}
async function googleToken(form:URLSearchParams):Promise<GoogleTokenResponse> {
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:form.toString(),redirect:'error'
  });
  if(!response.ok)throw new Error('Google authorization failed.');
  const raw:unknown=await response.json();
  if(!raw || typeof raw!=='object' || typeof (raw as GoogleTokenResponse).access_token!=='string')
    throw new Error('Google returned an invalid authorization response.');
  return raw as GoogleTokenResponse;
}
async function bearer(config:GoogleOAuthConfig,hash:string,stored:StoredToken):Promise<string> {
  const refresh=await decryptSecret(stored.refresh_token_ciphertext,config,hash);
  const payload=await googleToken(new URLSearchParams({
    grant_type:'refresh_token',refresh_token:refresh,
    client_id:config.clientId,client_secret:config.clientSecret
  }));
  if(payload.refresh_token && payload.refresh_token!==refresh) {
    await config.db.prepare('UPDATE daily_google_tokens SET refresh_token_ciphertext = ? WHERE owner_hash = ?')
      .bind(await encryptSecret(payload.refresh_token,config,hash),hash).run();
  }
  return payload.access_token!;
}
async function googleRead(token:string,url:URL):Promise<Record<string,unknown>> {
  const response=await fetch(url.toString(),{
    headers:{authorization:'Bearer '+token,accept:'application/json'},redirect:'error'
  });
  if(!response.ok){
    if(response.status===401||response.status===403)throw new Error('Google authorization expired or access denied.');
    if(response.status===429)throw new Error('Google Tasks rate limit reached.');
    throw new Error('Google Tasks unavailable.');
  }
  const data:unknown=await response.json();
  if(!data || typeof data!=='object' || Array.isArray(data))throw new Error('Invalid Google Tasks response.');
  return data as Record<string,unknown>;
}
async function readTasks(token:string,connectionId:string) {
  const taskLists:GoogleList[]=[];
  let cursor:string|undefined;
  const seenLists=new Set<string>();
  do {
    const url=new URL('https://tasks.googleapis.com/tasks/v1/users/@me/lists');
    url.searchParams.set('maxResults','100');
    if(cursor)url.searchParams.set('pageToken',cursor);
    const response=await googleRead(token,url);
    if(response.items!==undefined && !Array.isArray(response.items))throw new Error('Invalid Google task lists.');
    taskLists.push(...(response.items as GoogleList[]|undefined??[]));
    if(taskLists.length>25)throw new Error('Too many task lists; no partial data was saved.');
    cursor=typeof response.nextPageToken==='string'?response.nextPageToken:undefined;
    if(cursor && seenLists.has(cursor))throw new Error('Invalid Google list pagination.');
    if(cursor)seenLists.add(cursor);
  } while(cursor);
  const candidates:unknown[]=[];
  for(const list of taskLists) {
    if(typeof list.id!=='string'||!list.id)throw new Error('Invalid task list.');
    let page:string|undefined;
    const seen=new Set<string>();
    do {
      const url=new URL('https://tasks.googleapis.com/tasks/v1/lists/'+encodeURIComponent(list.id)+'/tasks');
      url.searchParams.set('maxResults','100');
      url.searchParams.set('showCompleted','true');
      url.searchParams.set('showHidden','true');
      url.searchParams.set('showDeleted','false');
      if(page)url.searchParams.set('pageToken',page);
      const response=await googleRead(token,url);
      if(response.items!==undefined && !Array.isArray(response.items))throw new Error('Invalid Google tasks.');
      for(const item of response.items as GoogleTask[]|undefined??[]) {
        if(!item || typeof item!=='object' || item.deleted)continue;
        if(typeof item.id!=='string'||typeof item.title!=='string'||!item.title.trim())continue;
        const externalId=JSON.stringify([list.id,item.id]);
        if(externalId.length>256)throw new Error('Google task ID exceeds supported size.');
        const title=item.title.trim().slice(0,160);
        candidates.push({
          title,source:{providerId:'google-tasks',connectionId,externalId,
            remoteStatus:item.status==='completed'?'completed':'open'},
          ...(typeof item.due==='string' && /^\d{4}-\d{2}-\d{2}T/.test(item.due)
            ? {dueDate:item.due.slice(0,10)} : {})
        });
        if(candidates.length>1000)throw new Error('More than 1,000 Google tasks. No partial data was saved.');
      }
      page=typeof response.nextPageToken==='string'?response.nextPageToken:undefined;
      if(page && seen.has(page))throw new Error('Invalid Google task pagination.');
      if(page)seen.add(page);
    }while(page);
  }
  return candidates;
}
async function quota(request:Request,type:'auth'|'tasks'):
  Promise<'allowed'|'limited'|'unavailable'> {
  const binding=env as unknown as GoogleOAuthEnv;
  const limiter=type==='auth'?binding.DAILY_GOOGLE_AUTH_LIMITER:binding.DAILY_GOOGLE_TASKS_LIMITER;
  if(!limiter)return 'unavailable';
  try {
    const ip=request.headers.get('cf-connecting-ip')||'unknown';
    const result=await limiter.limit({key:'daily-google:'+type+':'+ip});
    return result.success?'allowed':'limited';
  }catch{return 'unavailable';}
}

function returnToDaily(ok:boolean):Response {
  return new Response(null,{status:303,headers:{
    location:ok?'/daily?google=connected':'/daily?google=failed',...noStore
  }});
}

export const GET:RequestHandler=async ({params,request,url,cookies}) => {
  const config=configured(url.origin);
  if(params.action==='status' && !config)return reply({available:false,connected:false});
  if(!config)return failure('Google Tasks connection is not configured.',503);
  try {
    const hash=await owner(config,cookies.get(COOKIE));
    if(params.action==='status'){
      if(!hash)return reply({available:true,connected:false});
      const token=await tokenRow(config,hash);
      return reply({available:true,connected:!!token,...(token?{connectionId:token.connection_id}:{})});
    }
    if(params.action==='callback'){
      if(!hash)return returnToDaily(false);
      const state=url.searchParams.get('state');
      const code=url.searchParams.get('code');
      if(!state || !code || state.length>256 || code.length>4096)return returnToDaily(false);
      // DELETE RETURNING consumes the CSRF/PKCE flow exactly once, even across concurrent requests.
      const flow=await config.db.prepare(
        'DELETE FROM daily_oauth_flows WHERE state_hash = ? AND owner_hash = ? AND expires_at > ? RETURNING verifier_ciphertext'
      ).bind(await hashSecret(state),hash,Math.floor(Date.now()/1000)).first<Flow>();
      if(!flow)return returnToDaily(false);
      const verifier=await decryptSecret(flow.verifier_ciphertext,config,hash);
      const payload=await googleToken(new URLSearchParams({
        code,client_id:config.clientId,client_secret:config.clientSecret,
        redirect_uri:config.redirectUri,code_verifier:verifier,grant_type:'authorization_code'
      }));
      if(!payload.refresh_token)return returnToDaily(false);
      await config.db.prepare(
        'INSERT INTO daily_google_tokens(owner_hash,connection_id,refresh_token_ciphertext,connected_at) VALUES(?,?,?,?) '+
        'ON CONFLICT(owner_hash) DO UPDATE SET connection_id=excluded.connection_id,refresh_token_ciphertext=excluded.refresh_token_ciphertext,connected_at=excluded.connected_at'
      ).bind(hash,'google-tasks:'+crypto.randomUUID(),
        await encryptSecret(payload.refresh_token,config,hash),Math.floor(Date.now()/1000)).run();
      return returnToDaily(true);
    }
    if(params.action==='tasks'){
      if(!hash)return failure('Connect Google Tasks first.',401);
      const token=await tokenRow(config,hash);
      if(!token)return failure('Connect Google Tasks first.',401);
      const quotaResult=await quota(request,'tasks');
      if(quotaResult!=='allowed')
        return failure(quotaResult==='limited'?'Google Tasks refresh limit reached.':'Google Tasks rate limiter unavailable.',quotaResult==='limited'?429:503);
      const access=await bearer(config,hash,token);
      const items=await readTasks(access,token.connection_id);
      return reply({connectionId:token.connection_id,items});
    }
    return failure('Unknown action.',404);
  }catch{
    if(params.action==='callback')return returnToDaily(false);
    return failure('Google Tasks request failed; no local activities were modified.',502);
  }
};

export const POST:RequestHandler=async ({params,request,url,cookies}) => {
  if(!originAllowed(request.headers.get('origin'),url.origin))
    return failure('Invalid request origin.',403);
  const config=configured(url.origin);
  if(!config)return failure('Google Tasks connection is not configured.',503);
  try{
    if(params.action==='start'){
      const quotaResult=await quota(request,'auth');
      if(quotaResult!=='allowed')
        return failure(quotaResult==='limited'?'Too many Google connection attempts.':'OAuth rate limiter unavailable.',quotaResult==='limited'?429:503);
      const now=Math.floor(Date.now()/1000);
      // Opportunistic expiry purge: expired sessions must not retain recoverable credentials.
      await config.db.batch([
        config.db.prepare('DELETE FROM daily_google_tokens WHERE owner_hash IN (SELECT owner_hash FROM daily_oauth_sessions WHERE expires_at <= ?)').bind(now),
        config.db.prepare('DELETE FROM daily_oauth_flows WHERE expires_at <= ?').bind(now),
        config.db.prepare('DELETE FROM daily_oauth_sessions WHERE expires_at <= ?').bind(now)
      ]);
      let raw=cookies.get(COOKIE);
      let hash=await owner(config,raw);
      if(!hash){raw=randomSecret();hash=await hashSecret(raw);}
      const state=randomSecret();
      const verifier=randomSecret();
      const challenge=await hashSecret(verifier);
      const flow=config.db.prepare(
        'INSERT INTO daily_oauth_flows(state_hash,owner_hash,verifier_ciphertext,expires_at) VALUES(?,?,?,?)'
      ).bind(await hashSecret(state),hash,await encryptSecret(verifier,config,hash),now+OAUTH_TTL);
      await config.db.batch([
        config.db.prepare('INSERT INTO daily_oauth_sessions(owner_hash,expires_at) VALUES(?,?) '+
          'ON CONFLICT(owner_hash) DO UPDATE SET expires_at=excluded.expires_at').bind(hash,now+COOKIE_LIFETIME),
        flow
      ]);
      const auth=new URL('https://accounts.google.com/o/oauth2/v2/auth');
      for(const [key,value] of Object.entries({
        response_type:'code',client_id:config.clientId,redirect_uri:config.redirectUri,scope:SCOPE,
        access_type:'offline',prompt:'consent',code_challenge:challenge,
        code_challenge_method:'S256',state
      }))auth.searchParams.set(key,value);
      const response=reply({authorizationUrl:auth.toString()});
      cookies.set(COOKIE,raw!,browserCookieSettings(url));
      return response;
    }
    if(params.action==='disconnect'){
      const hash=await owner(config,cookies.get(COOKIE));
      if(!hash)return failure('No active Google connection.',401);
      const row=await tokenRow(config,hash);
      await config.db.batch([
        config.db.prepare('DELETE FROM daily_google_tokens WHERE owner_hash = ?').bind(hash),
        config.db.prepare('DELETE FROM daily_oauth_flows WHERE owner_hash = ?').bind(hash),
        config.db.prepare('DELETE FROM daily_oauth_sessions WHERE owner_hash = ?').bind(hash)
      ]);
      cookies.delete(COOKIE,{path:'/api/daily/google'});
      // Revocation is best effort; deletion from the credential vault is the security boundary.
      if(row) {
        try{
          const refresh=await decryptSecret(row.refresh_token_ciphertext,config,hash);
          await fetch('https://oauth2.googleapis.com/revoke',{
            method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
            body:new URLSearchParams({token:refresh}).toString()
          });
        }catch{ /* Google revocation may be temporarily unavailable. */ }
      }
      return reply({ok:true});
    }
    return failure('Unknown action.',404);
  }catch{return failure('Google Tasks connection could not be updated.',502);}
};
