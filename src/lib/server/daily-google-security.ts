/** Server-only crypto and configuration for browser-scoped Google Tasks OAuth. */
export type D1Statement = {
  bind(...values: (string | number | null)[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
};
export type D1Store = {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
};
export interface GoogleOAuthEnv {
  DAILY_AUTH_DB?: D1Store;
  DAILY_GOOGLE_AUTH_LIMITER?: {limit(options:{key:string}):Promise<{success:boolean}>};
  DAILY_GOOGLE_TASKS_LIMITER?: {limit(options:{key:string}):Promise<{success:boolean}>};
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_REDIRECT_URI?: string;
  GOOGLE_TOKEN_ENCRYPTION_KEY?: string;
}
export interface GoogleOAuthConfig {
  db: D1Store;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: string;
}
const encoder = new TextEncoder();

function encode64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function decode64(input: string): Uint8Array {
  if (!/^[a-zA-Z0-9_-]+$/.test(input)) throw new Error('Invalid encoding.');
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - input.length % 4) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}
export function randomSecret(): string {
  return encode64(crypto.getRandomValues(new Uint8Array(32)));
}
export async function hashSecret(value: string): Promise<string> {
  return encode64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
export function googleOAuthConfig(value: GoogleOAuthEnv, origin: string): GoogleOAuthConfig | null {
  const { DAILY_AUTH_DB: db, GOOGLE_OAUTH_CLIENT_ID: clientId,
    GOOGLE_OAUTH_CLIENT_SECRET: clientSecret, GOOGLE_OAUTH_REDIRECT_URI: redirectUri,
    GOOGLE_TOKEN_ENCRYPTION_KEY: encryptionKey } = value;
  if (!db || !clientId || !clientSecret || !redirectUri || !encryptionKey) return null;
  try {
    const parsed = new URL(redirectUri);
    const expected = new URL(origin);
    if (parsed.origin !== expected.origin ||
      parsed.pathname !== '/api/daily/google/callback' ||
      parsed.search || parsed.hash ||
      (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') ||
      decode64(encryptionKey).length !== 32) return null;
    return { db, clientId, clientSecret, redirectUri:parsed.href, encryptionKey };
  } catch { return null; }
}
async function importKey(encoded: string): Promise<CryptoKey> {
  const bytes = decode64(encoded);
  if (bytes.length !== 32) throw new Error('Invalid token key length.');
  return crypto.subtle.importKey('raw', bytes as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptSecret(secret: string, config: GoogleOAuthConfig, owner: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name:'AES-GCM',iv,additionalData:encoder.encode(owner) },
    await importKey(config.encryptionKey),encoder.encode(secret)
  ));
  return encode64(new Uint8Array([...iv,...ciphertext]));
}
export async function decryptSecret(ciphertext: string, config: GoogleOAuthConfig, owner: string): Promise<string> {
  const bytes = decode64(ciphertext);
  if (bytes.length < 29) throw new Error('Invalid encrypted payload.');
  const iv = bytes.slice(0,12);
  const encrypted = bytes.slice(12);
  const decoded = await crypto.subtle.decrypt(
    { name:'AES-GCM',iv,additionalData:encoder.encode(owner) },
    await importKey(config.encryptionKey),encrypted
  );
  return new TextDecoder().decode(decoded);
}
export function originAllowed(origin: string | null, expected: string): boolean {
  return origin === expected;
}
export function browserCookieSettings(url: URL) {
  return {
    path: '/api/daily/google',
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax' as const,
    maxAge: 30 * 24 * 60 * 60
  };
}
