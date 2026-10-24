<script lang="ts">
  import { ArrowLeft, Printer, LockKeyhole } from 'lucide-svelte';
  import { onMount } from 'svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import type { FinalizedSnapshot, Period } from '../core/types.ts';

  let { snapshot, onBack }: {
    snapshot: FinalizedSnapshot;
    onBack: () => void;
  } = $props();

  let heading: HTMLHeadingElement;
  onMount(() => heading?.focus());

  const kindLabels = {
    interview: 'Interview preparation', application: 'Job application',
    review: 'Performance review'
  };

  function periodLabel(period: Period): string {
    if (period.kind === 'all-time') return 'All time';
    if (period.kind === 'year') return String(period.year);
    return new Date(Date.UTC(period.year, period.month - 1, 1))
      .toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
</script>

<section aria-label="Finalized career document">
  <div class="career-print-controls mb-5 flex flex-wrap items-center justify-between gap-3">
    <Button variant="ghost" size="sm" class="-ml-2" onclick={onBack}>
      <ArrowLeft class="size-4"/> Back to builder
    </Button>
    <Button size="sm" onclick={() => window.print()}>
      <Printer class="size-4"/> Print / Save as PDF
    </Button>
  </div>
  <p class="career-print-controls mb-4 flex items-center gap-2 text-meta text-muted-foreground">
    <LockKeyhole class="size-4"/> Version {snapshot.version} · {snapshot.id.slice(0, 8)} · Finalized {new Date(snapshot.finalizedAt).toLocaleDateString()} · Immutable copy
  </p>

  <article id="career-print-sheet" aria-label="Printable career document"
    class="min-w-0 rounded-[20px] border border-border bg-card px-5 py-8 sm:px-8">
    <header class="mb-7 border-b border-border pb-5">
      <p class="mb-2 text-meta text-muted-foreground">{kindLabels[snapshot.kind]} · {periodLabel(snapshot.period)}</p>
      <h2 bind:this={heading} tabindex="-1"
        class="break-words text-page-title font-semibold tracking-[-0.04em] focus:outline-none">
        {snapshot.title}
      </h2>
      {#if snapshot.targetRole || snapshot.organization}
        <p class="mt-3 text-ui text-muted-foreground">
          {snapshot.targetRole || ''}{snapshot.targetRole && snapshot.organization ? ' · ' : ''}{snapshot.organization || ''}
        </p>
      {/if}
    </header>
    <div class="space-y-7">
      {#each snapshot.sections as section, index (section.momentId)}
        <section class="career-document-section">
          <p class="mb-2 text-meta text-muted-foreground">
            {String(index + 1).padStart(2, '0')} · {section.occurredOn}
            {#if section.project} · {section.project}{/if}
          </p>
          <h3 class="break-words text-title font-medium">{section.heading}</h3>
          <p class="mt-3 whitespace-pre-wrap break-words text-body leading-relaxed">{section.body}</p>
          {#if section.evidenceUrls.length}
            <div class="mt-3 space-y-1">
              <p class="text-meta font-medium text-muted-foreground">Evidence</p>
              {#each section.evidenceUrls as url}
                <p><a class="break-all text-meta text-primary underline-offset-2 hover:underline"
                  href={url} target="_blank" rel="noopener noreferrer">{url}</a></p>
              {/each}
            </div>
          {/if}
        </section>
      {/each}
    </div>
    <footer class="mt-8 border-t border-border pt-3 text-meta text-muted-foreground">
      Finalized {new Date(snapshot.finalizedAt).toLocaleDateString()} · Version {snapshot.version} · {snapshot.id.slice(0, 8)}
    </footer>
  </article>
</section>

<style>
  @media print {
    @page { size: A4; margin: 17mm; }
    :global(body *) { visibility: hidden !important; }
    :global(#career-print-sheet), :global(#career-print-sheet *) {
      visibility: visible !important;
    }
    :global(#career-print-sheet) {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      padding: 0 !important;
      border: 0 !important;
      box-shadow: none !important;
      background: white !important;
      color: #252525 !important;
    }
    .career-document-section { break-inside: avoid; }
  }
</style>
