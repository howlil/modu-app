<script lang="ts">
  import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, Plus, RefreshCw, Save, Search, X } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import type { CareerEvidenceController } from '../controller/career-evidence.svelte.ts';
  import GoalEditor from './GoalEditor.svelte';

  let { controller }: { controller: CareerEvidenceController } = $props();
  let editGoal = $state(false);
  let selectionSection: HTMLElement;

  const kindLabel = { interview: 'Interview', application: 'Application', review: 'Review' } as const;
</script>

{#if controller.outputDraft}
  <section aria-label="Career document builder">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-2">
      <Button variant="ghost" size="sm" class="-ml-2" onclick={controller.closeOutput}>
        <ArrowLeft class="size-4"/> All documents
      </Button>
      <Button size="sm" disabled={!controller.isOutputDirty || controller.isOutputStale || controller.busy}
        onclick={() => void controller.saveOutput()}>
        <Save class="size-4" /> {controller.busy ? 'Saving…' : 'Save draft'}
      </Button>
    </div>

    {#if controller.isOutputStale}
      <div role="alert" class="mb-4 rounded-xl border border-border bg-secondary p-4">
        <p class="text-ui font-medium">This document changed in another tab.</p>
        <p class="mt-1 text-meta text-muted-foreground">Your edits remain in this editor. Save is disabled to avoid overwriting newer content.</p>
        <Button class="mt-3" variant="outline" size="sm" onclick={controller.reloadOutputLatest}>
          <RefreshCw class="size-4"/> Load latest
        </Button>
      </div>
    {/if}

    {#if controller.confirmOutputDiscard}
      <div role="alert" class="mb-4 rounded-xl border border-border bg-muted p-4">
        <p class="text-ui font-medium">Discard unsaved document changes?</p>
        <p class="mt-1 text-meta text-muted-foreground">Your last saved draft will remain intact.</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onclick={controller.cancelOutputDiscard}>Keep editing</Button>
          <Button size="sm" variant="destructive" onclick={controller.discardOutput}>Discard changes</Button>
        </div>
      </div>
    {/if}

    <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-meta text-muted-foreground">{kindLabel[controller.outputDraft.kind]} · Draft</p>
        <h2 class="mt-1 break-words text-title-lg font-medium">{controller.outputDraft.title}</h2>
        <p class="mt-1 text-meta text-muted-foreground">
          {controller.outputDraft.targetRole || 'Any role'}
          {#if controller.outputDraft.organization} · {controller.outputDraft.organization}{/if}
          · {controller.outputDraft.items.length} selected
        </p>
      </div>
      <Button variant="outline" size="sm" onclick={() => editGoal = !editGoal}>
        {editGoal ? 'Close details' : 'Edit purpose'} <ChevronDown class="size-4"/>
      </Button>
    </div>

    {#if editGoal}
      <div class="mb-5 rounded-[20px] border border-border bg-card p-4 sm:p-5">
        <GoalEditor initial={controller.outputDraft} busy={controller.busy}
          error={controller.outputError}
          onCancel={() => editGoal = false}
          onSave={(input) => {
            if (controller.setOutputGoal(input)) editGoal = false;
          }}/>
      </div>
    {/if}

    {#if controller.outputError}
      <p role="alert" class="mb-4 rounded-xl border border-destructive/25 p-3 text-ui text-destructive">{controller.outputError}</p>
    {/if}

    <div class="grid min-w-0 gap-5 md:grid-cols-2">
      <section aria-label="Choose career evidence" bind:this={selectionSection}
        class="min-w-0 rounded-[20px] border border-border bg-card p-4">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-title font-medium">Choose evidence</h3>
          <span class="text-meta text-muted-foreground">{controller.outputDraft.items.length} selected</span>
        </div>
        <p class="mt-1 text-meta text-muted-foreground">Choose manually. Your source notes stay unchanged.</p>
        <div class="relative mt-4">
          <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
          <label for="output-moment-search" class="sr-only">Search evidence</label>
          <Input id="output-moment-search" type="search" class="pl-9"
            value={controller.outputQuery}
            oninput={(event) => controller.outputQuery = event.currentTarget.value}
            placeholder="Search past work…" />
        </div>
        {#if controller.availableEvidence.length === 0}
          <div class="mt-4 rounded-xl border border-dashed border-border p-4">
            <p class="text-ui">No matching experience.</p>
            <p class="mt-1 text-meta text-muted-foreground">Adjust the period or search, or capture new work in History.</p>
          </div>
        {:else}
          <div class="mt-3 max-h-[450px] overflow-y-auto border-t border-border">
            {#each controller.availableEvidence as source (source.id)}
              <label class="flex cursor-pointer items-start gap-3 border-b border-border py-3 hover:bg-muted/35">
                <input type="checkbox" class="mt-1 size-4 shrink-0 accent-primary"
                  checked={controller.outputDraft.items.some(item => item.momentId === source.id)}
                  disabled={controller.busy || controller.isOutputStale}
                  onchange={() => controller.toggleEvidence(source.id)} />
                <span class="min-w-0">
                  <span class="block break-words text-ui">{source.note}</span>
                  <span class="mt-1 block text-meta text-muted-foreground">
                    {source.occurredOn}{source.project ? ' · ' + source.project : ''}
                  </span>
                </span>
              </label>
            {/each}
          </div>
        {/if}
      </section>

      <section aria-label="Document draft" class="min-w-0 rounded-[20px] border border-border bg-card p-4">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-title font-medium">Live draft</h3>
          <span class="text-meta text-muted-foreground">{controller.outputPreview.length} stories</span>
        </div>
        <p class="mt-1 text-meta text-muted-foreground">Tailor wording here, not in your original notes.</p>
        {#if controller.outputPreview.length === 0}
          <div class="mt-4 rounded-xl border border-dashed border-border p-5 text-center">
            <p class="text-ui font-medium">No evidence selected yet.</p>
            <p class="mt-1 text-meta text-muted-foreground">Select an experience from the left to start this document.</p>
          </div>
        {:else}
          <div class="mt-4 space-y-5">
            {#each controller.outputPreview as item, index (item.momentId)}
              <article class="border-b border-border pb-5 last:border-0">
                <div class="mb-2 flex items-start justify-between gap-2">
                  <p class="min-w-0 break-words text-ui font-medium">{index + 1}. {item.title}</p>
                  <div class="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon-xs" aria-label={'Move story ' + (index + 1) + ' up'}
                      disabled={index === 0 || controller.busy || controller.isOutputStale}
                      onclick={() => controller.reorderEvidence(item.momentId, -1)}>
                      <ArrowUp class="size-3.5"/>
                    </Button>
                    <Button variant="ghost" size="icon-xs" aria-label={'Move story ' + (index + 1) + ' down'}
                      disabled={index === controller.outputPreview.length - 1 || controller.busy || controller.isOutputStale}
                      onclick={() => controller.reorderEvidence(item.momentId, 1)}>
                      <ArrowDown class="size-3.5"/>
                    </Button>
                    <Button variant="ghost" size="icon-xs" aria-label={'Remove story ' + (index + 1)}
                      disabled={controller.busy || controller.isOutputStale}
                      onclick={() => controller.toggleEvidence(item.momentId)}>
                      <X class="size-3.5"/>
                    </Button>
                  </div>
                </div>
                {#if item.sourceChanged || item.outOfPeriod || item.archived || item.missing}
                  <p class="mb-2 text-meta text-muted-foreground">
                    {item.missing ? 'Source unavailable · ' : ''}
                    {item.sourceChanged ? 'Source changed since selection · ' : ''}
                    {item.outOfPeriod ? 'Outside selected period · ' : ''}
                    {item.archived ? 'Archived source' : ''}
                  </p>
                {/if}
                <label class="mb-2 block text-meta text-muted-foreground" for={'output-story-' + item.momentId}>
                  Your narrative for this document
                </label>
                <Textarea id={'output-story-' + item.momentId} rows={3} maxlength={3500}
                  class="resize-y rounded-xl border border-input p-3"
                  value={controller.outputDraft.items.find(v => v.momentId === item.momentId)?.narrative ?? ''}
                  placeholder={item.narrative}
                  disabled={controller.busy || controller.isOutputStale}
                  oninput={(event) => controller.changeNarrative(item.momentId, event.currentTarget.value)}/>
                {#if item.evidenceUrls.length}
                  <p class="mt-2 text-meta text-muted-foreground">{item.evidenceUrls.length} linked evidence reference(s)</p>
                {/if}
              </article>
            {/each}
          </div>
        {/if}
      </section>
    </div>
    <div class="mt-5 flex items-center justify-between gap-3">
      <p role="status" class="text-meta text-muted-foreground">
        {controller.isOutputDirty ? 'Unsaved edits' : 'Draft saved'}
      </p>
      <Button disabled={!controller.isOutputDirty || controller.isOutputStale || controller.busy}
        onclick={() => void controller.saveOutput()}>
        <Save class="size-4"/> Save draft
      </Button>
    </div>
  </section>
{/if}
