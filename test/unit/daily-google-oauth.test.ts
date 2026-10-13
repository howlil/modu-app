import { describe, expect, it, vi } from 'vitest';
import { browserCookieSettings, decryptSecret, encryptSecret, googleOAuthConfig, hashSecret,
  originAllowed, randomSecret, type D1Store } from '../../src/lib/server/daily-google-security.ts';
import {beginGoogleConnection,fetchGoogleActivities,googleConnectionStatus,revokeGoogleConnection}
  from '../../src/lib/modules/daily-execution/adapters/google-tasks.ts';

const db = { prepare: (_query: string) => {throw new Error('unused');},batch:async()=>[]} as D1Store;
const makeKey=(length:number)=>btoa(String.fromCharCode(...new Uint8Array(length).fill(7)))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const key=makeKey(32);
function config() {
  const value=googleOAuthConfig({
    DAILY_AUTH_DB:db,
    GOOGLE_OAUTH_CLIENT_ID:'example.apps.googleusercontent.com',
    GOOGLE_OAUTH_CLIENT_SECRET:'server-secret',
    GOOGLE_OAUTH_REDIRECT_URI:'https://modu.howlil.site/api/daily/google/callback',
    GOOGLE_TOKEN_ENCRYPTION_KEY:key
  },'https://modu.howlil.site');
  if(!value)throw Error('Failed to configure test OAuth');
  return value;
}

describe('Google Tasks OAuth security contract',()=>{
 it('fails closed until database, client, secret, encryption and exact callback match',()=>{
   expect(googleOAuthConfig({},'https://modu.howlil.site')).toBeNull();
   const valid=config();
   expect(valid.redirectUri).toBe('https://modu.howlil.site/api/daily/google/callback');
   expect(googleOAuthConfig({
     DAILY_AUTH_DB:db,GOOGLE_OAUTH_CLIENT_ID:valid.clientId,
     GOOGLE_OAUTH_CLIENT_SECRET:valid.clientSecret,
     GOOGLE_OAUTH_REDIRECT_URI:'https://evil.example/api/daily/google/callback',
     GOOGLE_TOKEN_ENCRYPTION_KEY:key
   },'https://modu.howlil.site')).toBeNull();
   expect(googleOAuthConfig({
     DAILY_AUTH_DB:db,GOOGLE_OAUTH_CLIENT_ID:valid.clientId,
     GOOGLE_OAUTH_CLIENT_SECRET:valid.clientSecret,
     GOOGLE_OAUTH_REDIRECT_URI:valid.redirectUri,
     GOOGLE_TOKEN_ENCRYPTION_KEY:makeKey(16)
   },'https://modu.howlil.site')).toBeNull();
 });
 it('requires exact origin for CSRF-sensitive POST routes',()=>{
   expect(originAllowed('https://modu.howlil.site','https://modu.howlil.site')).toBe(true);
   expect(originAllowed(null,'https://modu.howlil.site')).toBe(false);
   expect(originAllowed('https://other.example','https://modu.howlil.site')).toBe(false);
 });
 it('uses an unguessable session seed and PKCE challenge hash',async()=>{
   const secret=randomSecret();
   expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
   expect(await hashSecret(secret)).toMatch(/^[A-Za-z0-9_-]{43}$/);
   expect(await hashSecret(secret)).not.toBe(secret);
   expect(randomSecret()).not.toBe(secret);
 });
 it('encrypts credentials with AES-GCM and binds ciphertext to the owner',async()=>{
   const oauth=config();
   const encrypted=await encryptSecret('refresh-token-example',oauth,'owner-a');
   expect(encrypted).not.toContain('refresh-token-example');
   expect(await decryptSecret(encrypted,oauth,'owner-a')).toBe('refresh-token-example');
   await expect(decryptSecret(encrypted,oauth,'owner-b')).rejects.toThrow();
   // Flip an authenticated IV byte, not an unused trailing base64 padding bit.
   const changed=(encrypted[0]==='A'?'B':'A')+encrypted.slice(1);
   await expect(decryptSecret(changed,oauth,'owner-a')).rejects.toThrow();
 });
 it('sets HttpOnly Lax cookie scoped to Google auth endpoints',()=>{
   const cookie=browserCookieSettings(new URL('https://modu.howlil.site/daily'));
   expect(cookie).toMatchObject({path:'/api/daily/google',httpOnly:true,secure:true,sameSite:'lax'});
 });
});

describe('Google Tasks client adapter',()=>{
 it('reports disabled providers without assuming a linked account',async()=>{
   const fetcher=vi.fn(async ()=>new Response(JSON.stringify({available:false,connected:false}),{
     status:200,headers:{'content-type':'application/json'}
   })) as typeof fetch;
   expect(await googleConnectionStatus(fetcher)).toEqual({available:false,connected:false});
   expect(fetcher).toHaveBeenCalledWith('/api/daily/google/status',{
     credentials:'same-origin',cache:'no-store'
   });
 });
 it('accepts only official Google authorization URLs',async()=>{
   const safe=vi.fn(async()=>Response.json({authorizationUrl:'https://accounts.google.com/o/oauth2/v2/auth?state=abc'})) as typeof fetch;
   expect(await beginGoogleConnection(safe)).toContain('accounts.google.com');
   const malicious=vi.fn(async()=>Response.json({authorizationUrl:'https://evil.example/steal'})) as typeof fetch;
   await expect(beginGoogleConnection(malicious)).rejects.toThrow('Invalid Google sign-in URL');
 });
 it('rejects source identity mismatches and preserves same-origin credentials',async()=>{
   const candidate={title:'Plan weekend',source:{
     providerId:'google-tasks',connectionId:'google-tasks:browser1',externalId:'[\"list\",\"task\"]',remoteStatus:'open'
   }};
   const fetcher=vi.fn(async()=>Response.json({
     connectionId:'google-tasks:browser1',items:[candidate]
   })) as typeof fetch;
   expect((await fetchGoogleActivities(fetcher)).items).toHaveLength(1);
   const bad=vi.fn(async()=>Response.json({
     connectionId:'google-tasks:other',items:[candidate]
   })) as typeof fetch;
   await expect(fetchGoogleActivities(bad)).rejects.toThrow('invalid linked activities');
   expect(fetcher).toHaveBeenCalledWith('/api/daily/google/tasks',{
     credentials:'same-origin',cache:'no-store'
   });
 });
 it('uses POST with same-origin credentials to disconnect',async()=>{
   const fetcher=vi.fn(async()=>Response.json({ok:true})) as typeof fetch;
   await revokeGoogleConnection(fetcher);
   expect(fetcher).toHaveBeenCalledWith('/api/daily/google/disconnect',{
     method:'POST',credentials:'same-origin',cache:'no-store',
     headers:{'content-type':'application/json'},body:'{}'
   });
 });
});
