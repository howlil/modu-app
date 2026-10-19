import { openLanguageLearningStorage } from './language-learning-storage.ts';
import { decodePracticeCommand, PracticeStorageRuleError } from '../src/lib/modules/language-learning/core/persistence.ts';
import { LearningRuleError } from '../src/lib/modules/language-learning/core/learning.ts';

/** Self-hosted API. Must be reached through a same-origin reverse proxy behind user-managed access control. */
const port = Number(process.env.MODU_LEARNING_PORT ?? 8789);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid MODU_LEARNING_PORT');
const allowedOrigin = process.env.MODU_LEARNING_ORIGIN ?? ('http://localhost:' + port);
const allowed = new URL(allowedOrigin);
if (!['http:', 'https:'].includes(allowed.protocol) || allowed.pathname !== '/' ||
  allowed.search || allowed.hash || allowed.username || allowed.password) {
  throw new Error('MODU_LEARNING_ORIGIN must be a single exact HTTP(S) origin');
}
const dbPath = process.env.MODU_LEARNING_DB ?? './data/language-learning.sqlite';
const storage = openLanguageLearningStorage(dbPath);
const pathPrefix = '/api/language-learning';
function error(code: string, message: string, status: number) {
  return Response.json({code, message}, {status, headers:{'Cache-Control':'no-store'}});
}
Bun.serve({
  hostname: '127.0.0.1', port, development: false,
  async fetch(request) {
    const uri = new URL(request.url);
    const host = request.headers.get('host');
    const origin = request.headers.get('origin');
    const site = request.headers.get('sec-fetch-site');
    // Same-origin only. No CORS, wildcard origins, cookies, login, or public bind.
    if (!host || ![allowed.host, 'localhost:' + port, '127.0.0.1:' + port].includes(host) ||
      (origin !== null && origin !== allowed.origin) ||
      (site && site !== 'same-origin' && site !== 'none')) {
      return error('forbidden', 'This service accepts same-origin requests only.', 403);
    }
    if (uri.pathname === pathPrefix + '/state' && request.method === 'GET') {
      try {
        return Response.json({record: storage.latest()}, {headers:{'Cache-Control':'no-store'}});
      } catch { return error('storage_unavailable', 'Could not read learning records.', 503); }
    }
    if (uri.pathname === pathPrefix + '/commands' && request.method === 'POST') {
      if (!request.headers.get('content-type')?.startsWith('application/json') ||
        request.headers.get('x-modu-learning-request') !== '1') {
        return error('invalid_request', 'JSON and request header required.', 415);
      }
      const body = await request.text();
      if (body.length > 262144) return error('too_large', 'Request exceeds 256 KiB.', 413);
      try {
        const raw: unknown = JSON.parse(body);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          return error('invalid_request', 'Invalid command envelope.', 400);
        }
        const envelope = raw as Record<string, unknown>;
        const expectedRevision = envelope.expectedRevision;
        if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) ||
          (expectedRevision as number) < 0)) {
          return error('invalid_request', 'Expected revision must be a non-negative integer or null.', 400);
        }
        const command = decodePracticeCommand(envelope.command);
        const record = storage.execute(command, expectedRevision as number | null);
        return Response.json({record}, {headers:{'Cache-Control':'no-store'}});
      } catch (cause) {
        if (cause instanceof PracticeStorageRuleError) {
          const status = cause.code === 'conflict' ? 409 : cause.code === 'not_found' ? 404 : 422;
          return error(cause.code, cause.message, status);
        }
        if (cause instanceof LearningRuleError) return error(cause.code, cause.message, 422);
        if (cause instanceof SyntaxError) return error('invalid_request', 'Malformed JSON.', 400);
        return error('storage_unavailable', 'Could not commit learning state.', 503);
      }
    }
    return error('not_found', 'Unknown endpoint.', 404);
  }
});
console.info('Learning storage listening on 127.0.0.1:' + port);
