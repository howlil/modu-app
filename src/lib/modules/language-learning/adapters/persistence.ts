import { decodeStoredPractice, type PracticeCommand, type StoredPractice }
  from '../core/persistence.ts';

export class LearningPersistenceError extends Error {
  constructor(readonly code: 'unavailable' | 'conflict' | 'invalid' | 'corrupt', message: string) {
    super(message);
    this.name = 'LearningPersistenceError';
  }
}
const base = '/api/language-learning';
async function decoded(response: Response): Promise<StoredPractice | null> {
  let raw: unknown;
  try { raw = await response.json(); }
  catch { throw new LearningPersistenceError('unavailable', 'Learning storage returned an invalid response.'); }
  if (!response.ok) {
    const problem = raw as { code?: unknown; message?: unknown } | null;
    throw new LearningPersistenceError(
      response.status === 409 ? 'conflict' : response.status === 422 ? 'invalid' : 'unavailable',
      typeof problem?.message === 'string' ? problem.message : 'Learning storage is unavailable.'
    );
  }
  if (!raw || typeof raw !== 'object' || !('record' in raw)) {
    throw new LearningPersistenceError('corrupt', 'Learning storage response is missing a record.');
  }
  const record = (raw as {record: unknown}).record;
  if (record === null) return null;
  try { return decodeStoredPractice(record); }
  catch { throw new LearningPersistenceError('corrupt', 'Learning storage returned corrupt data.'); }
}
async function request(url: string, options: RequestInit = {}) {
  try {
    return await fetch(url, { ...options, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new LearningPersistenceError('unavailable', 'Unable to reach self-hosted language storage.');
  }
}
/** Client adapter targets only the same-origin self-hosted reverse proxy. No browser-local silent fallback. */
export const learningPersistence = {
  async latest(): Promise<StoredPractice | null> {
    return decoded(await request(base + '/state'));
  },
  async execute(command: PracticeCommand, expectedRevision: number | null): Promise<StoredPractice> {
    const record = await decoded(await request(base + '/commands', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Modu-Learning-Request': '1'},
      body: JSON.stringify({command, expectedRevision})
    }));
    if (!record) throw new LearningPersistenceError('corrupt', 'Saved session was not returned.');
    return record;
  }
};
