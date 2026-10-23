import type { CareerMoment } from '../core/types.ts';
import { CareerValidationError, createMoment, filterMoments } from '../core/moments.ts';
import {
  addMoment, downloadLocalBackup, loadMoments, type CareerStorageError
} from '../adapters/persistence.ts';

export type CareerView = 'capture' | 'history';

function explainError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'The operation failed. Your input has not been removed.';
}

/** This factory is called once for each mounted workspace. Never export shared state. */
export function createCareerEvidenceController() {
  let view = $state<CareerView>('capture');
  let moments = $state<CareerMoment[]>([]);
  let loading = $state(true);
  let storageReady = $state(false);
  let busy = $state(false);
  let noteDraft = $state('');
  let evidenceDraft = $state('');
  let query = $state('');
  let error = $state('');
  let notice = $state('');
  let readVersion = 0;

  const visibleMoments = $derived(filterMoments(moments, query));
  const recentMoments = $derived(filterMoments(moments, '').slice(0, 3));

  async function reload(): Promise<void> {
    const current = ++readVersion;
    try {
      const stored = await loadMoments();
      if (current !== readVersion) return;
      moments = stored;
      storageReady = true;
      if (!busy) error = '';
    } catch (failure) {
      if (current !== readVersion) return;
      storageReady = false;
      error = 'Could not safely load your career history. ' + explainError(failure);
    } finally {
      if (current === readVersion) loading = false;
    }
  }

  async function capture(): Promise<boolean> {
    if (busy || !storageReady) return false;
    // Validate before entering the asynchronous transaction.
    let moment: CareerMoment;
    try {
      const now = new Date();
      moment = createMoment(
        { note: noteDraft, evidenceUrl: evidenceDraft },
        crypto.randomUUID(), now, crypto.randomUUID()
      );
    } catch (failure) {
      error = explainError(failure);
      return false;
    }
    busy = true;
    notice = '';
    error = '';
    try {
      await addMoment(moment);
      moments = [moment, ...moments.filter(item => item.id !== moment.id)];
      noteDraft = '';
      evidenceDraft = '';
      notice = 'Moment saved.';
      return true;
    } catch (failure) {
      error = 'Not saved. ' + explainError(failure);
      return false;
    } finally { busy = false; }
  }

  async function exportBackup(): Promise<void> {
    if (busy || !storageReady) return;
    busy = true;
    error = '';
    try {
      await downloadLocalBackup();
      notice = 'Backup downloaded.';
    } catch (failure) {
      error = 'Could not export backup. ' + explainError(failure);
    } finally { busy = false; }
  }

  return {
    get view() { return view; },
    set view(next: CareerView) { view = next; notice = ''; error = ''; },
    get moments() { return moments; },
    get visibleMoments() { return visibleMoments; },
    get recentMoments() { return recentMoments; },
    get loading() { return loading; },
    get storageReady() { return storageReady; },
    get busy() { return busy; },
    get noteDraft() { return noteDraft; },
    set noteDraft(next: string) { noteDraft = next; notice = ''; },
    get evidenceDraft() { return evidenceDraft; },
    set evidenceDraft(next: string) { evidenceDraft = next; notice = ''; },
    get query() { return query; },
    set query(next: string) { query = next; },
    get error() { return error; },
    get notice() { return notice; },
    reload, capture, exportBackup
  };
}
export type CareerEvidenceController = ReturnType<typeof createCareerEvidenceController>;
