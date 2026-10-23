<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Archive, ArchiveRestore, RefreshCw, Save } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import type { Verification } from '../core/types.ts';
  import type { CareerEvidenceController } from '../controller/career-evidence.svelte.ts';

  let { controller }: { controller: CareerEvidenceController } = $props();
  let heading: HTMLHeadingElement;

  onMount(() => { heading?.focus(); });

  function save(event: SubmitEvent): void {
    event.preventDefault();
    void controller.saveEdit();
  }
  function shortcut(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void controller.saveEdit();
    }
  }
</script>

{#if controller.editDraft && controller.selectedMoment}
  <section aria-label="Edit career moment">
    <Button variant="ghost" size="sm" class="mb-5 -ml-2" onclick={controller.requestCloseMoment}>
      <ArrowLeft class="size-4"/> Back to history
    </Button>

    <div class="mb-5 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 bind:this={heading} tabindex="-1" class="text-title-lg font-medium focus:outline-none">Moment details</h2>
        <p class="mt-1 text-meta text-muted-foreground">
          Saved {controller.selectedMoment.occurredOn} · Revision {controller.selectedMoment.revision}
        </p>
      </div>
      {#if controller.selectedMoment.archivedAt}
        <span class="rounded-full bg-muted px-3 py-1 text-meta text-muted-foreground">Archived</span>
      {/if}
    </div>

    {#if controller.isStale}
      <div role="alert" class="mb-4 rounded-xl border border-border bg-secondary px-4 py-3 text-ui">
        <p class="font-medium">This moment changed in another tab.</p>
        <p class="mt-1 text-muted-foreground">Your edits are still here. Review or copy them before loading the saved version.</p>
        <Button type="button" size="sm" variant="outline" class="mt-3" onclick={controller.requestReloadLatest}>
          <RefreshCw class="size-4"/> Reload saved version
        </Button>
      </div>
    {/if}

    {#if controller.confirmDiscard}
      <div role="alert" class="mb-4 rounded-xl border border-border bg-muted p-4">
        <p class="text-ui font-medium">Discard unsaved changes?</p>
        <p class="mt-1 text-meta text-muted-foreground">The saved record will remain unchanged.</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onclick={controller.cancelDiscard}>Keep editing</Button>
          <Button size="sm" variant="destructive" onclick={controller.confirmDiscardChanges}>Discard changes</Button>
        </div>
      </div>
    {/if}

    <form onsubmit={save} onkeydown={shortcut} class="rounded-[20px] border border-border bg-card p-4 sm:p-5">
      <div class="space-y-4">
        <div>
          <label for="moment-note" class="mb-2 block text-ui font-medium">What did you work on?</label>
          <Textarea id="moment-note" rows={3} maxlength={3000} class="resize-y rounded-xl border border-input p-3"
            value={controller.editDraft.note}
            oninput={(event) => controller.changeEditField('note', event.currentTarget.value)}
            disabled={controller.busy}/>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="moment-date" class="mb-2 block text-meta text-muted-foreground">Date</label>
            <Input id="moment-date" type="date" value={controller.editDraft.occurredOn}
              oninput={(event) => controller.changeEditField('occurredOn', event.currentTarget.value)}
              disabled={controller.busy}/>
          </div>
          <div>
            <label for="moment-project" class="mb-2 block text-meta text-muted-foreground">Project (optional)</label>
            <Input id="moment-project" maxlength={120} placeholder="Project or team"
              value={controller.editDraft.project}
              oninput={(event) => controller.changeEditField('project', event.currentTarget.value)}
              disabled={controller.busy}/>
          </div>
        </div>
      </div>

      <details class="mt-5 border-t border-border pt-5"
        open={Boolean(controller.selectedMoment.problem || controller.selectedMoment.contribution || controller.selectedMoment.outcome)}>
        <summary class="cursor-pointer text-ui font-medium">Engineering story <span class="text-meta font-normal text-muted-foreground">· optional</span></summary>
        <p class="mt-2 text-meta text-muted-foreground">Add only what you know. Metrics are not required.</p>
        <div class="mt-4 space-y-4">
          <div>
            <label for="moment-problem" class="mb-2 block text-meta text-muted-foreground">Problem / context</label>
            <Textarea id="moment-problem" maxlength={2000} rows={3} class="resize-y rounded-xl border border-input p-3"
              placeholder="What was difficult or missing?"
              value={controller.editDraft.problem}
              oninput={(event) => controller.changeEditField('problem', event.currentTarget.value)}
              disabled={controller.busy}/>
          </div>
          <div>
            <label for="moment-contribution" class="mb-2 block text-meta text-muted-foreground">Your contribution</label>
            <Textarea id="moment-contribution" maxlength={2000} rows={3} class="resize-y rounded-xl border border-input p-3"
              placeholder="What did you do yourself?"
              value={controller.editDraft.contribution}
              oninput={(event) => controller.changeEditField('contribution', event.currentTarget.value)}
              disabled={controller.busy}/>
          </div>
          <div>
            <label for="moment-outcome" class="mb-2 block text-meta text-muted-foreground">Outcome / impact</label>
            <Textarea id="moment-outcome" maxlength={2000} rows={3} class="resize-y rounded-xl border border-input p-3"
              placeholder="What changed? An observed outcome is enough."
              value={controller.editDraft.outcome}
              oninput={(event) => controller.changeEditField('outcome', event.currentTarget.value)}
              disabled={controller.busy}/>
          </div>
          <div>
            <label for="moment-verification" class="mb-2 block text-meta text-muted-foreground">How was the outcome verified?</label>
            <select id="moment-verification" class="h-9 w-full rounded-md border border-input bg-card px-3 text-ui outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              value={controller.editDraft.verification}
              onchange={(event) => controller.changeEditField('verification', event.currentTarget.value as Verification)}
              disabled={controller.busy}>
              <option value="not-measured">Not measured</option>
              <option value="observed">Observed</option>
              <option value="measured">Measured</option>
            </select>
          </div>
        </div>
      </details>

      <details class="mt-5 border-t border-border pt-5" open={controller.selectedMoment.evidence.length > 0}>
        <summary class="cursor-pointer text-ui font-medium">Evidence links <span class="text-meta font-normal text-muted-foreground">· optional</span></summary>
        <p class="mt-2 text-meta text-muted-foreground">One HTTP(S) URL per line. Up to 12 links; unchanged links keep their identity.</p>
        <label for="moment-evidence" class="sr-only">Evidence URLs</label>
        <Textarea id="moment-evidence" rows={3} class="mt-3 resize-y rounded-xl border border-input p-3"
          placeholder="https://github.com/…"
          value={controller.editDraft.evidenceUrls}
          oninput={(event) => controller.changeEditField('evidenceUrls', event.currentTarget.value)}
          disabled={controller.busy}/>
      </details>

      {#if controller.editError}
        <p role="alert" class="mt-4 text-ui text-destructive">{controller.editError}</p>
      {/if}
      <div class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button type="button" variant="ghost" size="sm"
          disabled={controller.busy || controller.isDirty || controller.isStale}
          title={controller.isDirty ? 'Save or discard edits first' : undefined}
          onclick={() => void controller.setArchived(controller.selectedMoment!.id, !controller.selectedMoment!.archivedAt)}>
          {#if controller.selectedMoment.archivedAt}
            <ArchiveRestore class="size-4"/> Restore moment
          {:else}
            <Archive class="size-4"/> Archive moment
          {/if}
        </Button>
        <Button type="submit" disabled={controller.busy || !controller.isDirty || controller.isStale}>
          <Save class="size-4"/> {controller.busy ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  </section>
{/if}
