import type { CareerMoment, MomentEditInput, Period } from '../core/types.ts';
import { createMoment, filterMoments } from '../core/moments.ts';
import { applyMomentEdit, setMomentArchived, toMomentEditInput } from '../core/enrichment.ts';
import {
  addMoment, downloadLocalBackup, loadMoments, replaceMoment
} from '../adapters/persistence.ts';

export type CareerView = 'capture' | 'history';

function explainError(error: unknown): string {
  return error instanceof Error ? error.message : 'The operation failed. Your changes remain here.';
}

/** Per-workspace Svelte 5 controller; source edits never depend on component lifetime. */
export function createCareerEvidenceController() {
  let view = $state<CareerView>('capture');
  let moments = $state<CareerMoment[]>([]);
  let loading = $state(true);
  let storageReady = $state(false);
  let busy = $state(false);
  let noteDraft = $state('');
  let evidenceDraft = $state('');
  let query = $state('');
  let showArchived = $state(false);
  let periodMode = $state<'all' | 'year' | 'month'>('all');
  let periodYear = $state(new Date().getFullYear());
  let periodMonth = $state((new Date().getFullYear()) + '-' +
    String(new Date().getMonth() + 1).padStart(2, '0'));
  let error = $state('');
  let notice = $state('');
  let selectedMomentId = $state<string | null>(null);
  let editBase = $state<CareerMoment | null>(null);
  let editDraft = $state<MomentEditInput | null>(null);
  let editError = $state('');
  let confirmDiscard = $state(false);
  let pendingView = $state<CareerView | null>(null);
  let pendingReload = $state(false);
  let readVersion = 0;

  const recentMoments = $derived(filterMoments(moments, '').slice(0, 3));
  const activeCount = $derived(moments.filter(moment => !moment.archivedAt).length);
  const archivedCount = $derived(moments.filter(moment => moment.archivedAt).length);
  const selectedPeriod = $derived.by((): Period | undefined => {
    if (periodMode === 'all') return undefined;
    if (periodMode === 'year') return Number.isSafeInteger(periodYear) && periodYear >= 1 && periodYear <= 9999
      ? { kind: 'year', year: periodYear } : undefined;
    const match = /^(\d{4})-(\d{2})$/.exec(periodMonth);
    return match ? { kind: 'month', year: Number(match[1]), month: Number(match[2]) } : undefined;
  });
  const visibleMoments = $derived(
    filterMoments(moments, query, { includeArchived: true, period: selectedPeriod })
      .filter(moment => Boolean(moment.archivedAt) === showArchived)
  );
  const selectedMoment = $derived(
    moments.find(moment => moment.id === selectedMomentId) ?? null
  );
  const isDirty = $derived(
    !!editBase && !!editDraft &&
    JSON.stringify(editDraft) !== JSON.stringify(toMomentEditInput(editBase))
  );
  const isStale = $derived(
    !!editBase && (!selectedMoment || selectedMoment.revision !== editBase.revision)
  );

  function clearEditor(): void {
    selectedMomentId = null;
    editBase = null;
    editDraft = null;
    editError = '';
    confirmDiscard = false;
    pendingView = null;
    pendingReload = false;
  }

  function navigate(next: CareerView): void {
    if (next === view) return;
    if (selectedMomentId && isDirty) {
      pendingView = next;
      pendingReload = false;
      confirmDiscard = true;
      return;
    }
    clearEditor();
    view = next;
    notice = '';
    error = '';
  }

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

  function openMoment(id: string): void {
    const moment = moments.find(item => item.id === id);
    if (!moment) return;
    // A second selection never replaces an unsaved edit without confirmation.
    if (selectedMomentId && selectedMomentId !== id && isDirty) {
      editError = 'Save or discard your changes before opening another moment.';
      return;
    }
    selectedMomentId = id;
    editBase = moment;
    editDraft = toMomentEditInput(moment);
    editError = '';
    confirmDiscard = false;
    pendingView = null;
    pendingReload = false;
    view = 'history';
  }

  function changeEditField<K extends keyof MomentEditInput>(
    field: K, value: MomentEditInput[K]
  ): void {
    if (!editDraft) return;
    editDraft = { ...editDraft, [field]: value };
    editError = '';
    confirmDiscard = false;
  }

  function requestCloseMoment(): void {
    if (busy) return;
    if (isDirty) {
      confirmDiscard = true;
      pendingView = null;
      pendingReload = false;
    } else clearEditor();
  }

  function requestReloadLatest(): void {
    if (!selectedMoment || busy) return;
    if (isDirty) {
      confirmDiscard = true;
      pendingReload = true;
      pendingView = null;
    } else {
      editBase = selectedMoment;
      editDraft = toMomentEditInput(selectedMoment);
      editError = '';
    }
  }

  function cancelDiscard(): void {
    confirmDiscard = false;
    pendingView = null;
    pendingReload = false;
  }

  function confirmDiscardChanges(): void {
    if (pendingReload && selectedMoment) {
      editBase = selectedMoment;
      editDraft = toMomentEditInput(selectedMoment);
      editError = '';
      confirmDiscard = false;
      pendingReload = false;
      pendingView = null;
      return;
    }
    const next = pendingView;
    clearEditor();
    if (next) {
      view = next;
      notice = '';
      error = '';
    }
  }

  async function saveEdit(): Promise<boolean> {
    if (!storageReady || busy || !editBase || !editDraft) return false;
    if (isStale) {
      editError = 'This moment changed in another tab. Review the latest saved version before editing.';
      return false;
    }
    let updated: CareerMoment;
    try {
      updated = applyMomentEdit(editBase, editDraft, new Date(), () => crypto.randomUUID());
    } catch (failure) {
      editError = explainError(failure);
      return false;
    }
    busy = true;
    editError = '';
    notice = '';
    try {
      await replaceMoment(updated, editBase.revision);
      moments = moments.map(item => item.id === updated.id ? updated : item);
      editBase = updated;
      editDraft = toMomentEditInput(updated);
      notice = 'Changes saved.';
      return true;
    } catch (failure) {
      await reload();
      editError = 'Changes not saved. ' + explainError(failure);
      return false;
    } finally { busy = false; }
  }

  async function setArchived(id: string, archived: boolean): Promise<boolean> {
    if (!storageReady || busy) return false;
    if (selectedMomentId === id && isDirty) {
      editError = 'Save or discard changes before archiving this moment.';
      return false;
    }
    const current = moments.find(moment => moment.id === id);
    if (!current) return false;
    let updated: CareerMoment;
    try { updated = setMomentArchived(current, archived, new Date()); }
    catch (failure) { editError = explainError(failure); return false; }
    if (updated === current) return true;
    busy = true;
    editError = '';
    try {
      await replaceMoment(updated, current.revision);
      moments = moments.map(moment => moment.id === id ? updated : moment);
      if (selectedMomentId === id) clearEditor();
      notice = archived ? 'Moment archived. Find it under Archived.' : 'Moment restored.';
      return true;
    } catch (failure) {
      await reload();
      error = 'Could not change archive state. ' + explainError(failure);
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
    set view(next: CareerView) { navigate(next); },
    get moments() { return moments; },
    get visibleMoments() { return visibleMoments; },
    get recentMoments() { return recentMoments; },
    get activeCount() { return activeCount; },
    get archivedCount() { return archivedCount; },
    get showArchived() { return showArchived; },
    set showArchived(next: boolean) { if (!selectedMomentId) showArchived = next; },
    get periodMode() { return periodMode; },
    set periodMode(next: 'all' | 'year' | 'month') { periodMode = next; },
    get periodYear() { return periodYear; },
    set periodYear(next: number) { periodYear = next; },
    get periodMonth() { return periodMonth; },
    set periodMonth(next: string) { periodMonth = next; },
    get selectedMoment() { return selectedMoment; },
    get selectedMomentId() { return selectedMomentId; },
    get editDraft() { return editDraft; },
    get isDirty() { return isDirty; },
    get isStale() { return isStale; },
    get editError() { return editError; },
    get confirmDiscard() { return confirmDiscard; },
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
    reload, capture, openMoment, changeEditField, requestCloseMoment,
    requestReloadLatest, cancelDiscard, confirmDiscardChanges, saveEdit,
    setArchived, exportBackup
  };
}
export type CareerEvidenceController = ReturnType<typeof createCareerEvidenceController>;
