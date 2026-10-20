<script lang="ts">
  import type {LearningProgress} from '../core/progress.ts';
  let {progress,error,onRefresh}:{
    progress:LearningProgress|null;
    error:string;
    onRefresh:()=>void;
  }=$props();
  const kindLabel=(kind:string,rating:string|null)=>
    kind==='recall'? 'Recall · '+rating :
    kind==='listening'? 'Listening' :
    kind==='shadowing'? 'Shadowing' : 'Skipped';
  const validDate=(ms:number)=>Number.isFinite(ms) && ms>=0 &&
    ms<=8_640_000_000_000_000;
  const formatISO=(ms:number)=>validDate(ms)?new Date(ms).toISOString():undefined;
  const formatDate=(ms:number)=>validDate(ms)?new Date(ms).toLocaleString(undefined,{
    year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'
  }):'Time unavailable';
</script>

<section class="mt-6 border-t border-border pt-5" aria-label="Learning progress">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 class="text-title font-semibold">Progress</h2>
    <button type="button" class="rounded-full border border-border px-3 py-2 text-meta"
      onclick={onRefresh}>Refresh progress</button>
  </div>
  {#if error}
    <p class="mt-3 text-ui text-destructive" role="alert">{error}</p>
  {:else if progress}
    <dl class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="border-b border-border pb-2"><dt class="text-meta text-muted-foreground">Rated recalls</dt>
        <dd class="text-title font-semibold">{progress.ratedRecalls}</dd></div>
      <div class="border-b border-border pb-2"><dt class="text-meta text-muted-foreground">Recalled successfully</dt>
        <dd class="text-title font-semibold">{progress.successfulRecalls}</dd></div>
      <div class="border-b border-border pb-2"><dt class="text-meta text-muted-foreground">Due now</dt>
        <dd class="text-title font-semibold">{progress.dueNow}</dd></div>
      <div class="border-b border-border pb-2"><dt class="text-meta text-muted-foreground">Completed sessions</dt>
        <dd class="text-title font-semibold">{progress.sessionsCompleted}</dd></div>
      <div class="border-b border-border pb-2"><dt class="text-meta text-muted-foreground">Listened</dt>
        <dd class="text-title font-semibold">{progress.listeningExposures}</dd></div>
      <div class="border-b border-border pb-2"><dt class="text-meta text-muted-foreground">Shadowed</dt>
        <dd class="text-title font-semibold">{progress.shadowingExposures}</dd></div>
      <div class="border-b border-border pb-2"><dt class="text-meta text-muted-foreground">Skipped</dt>
        <dd class="text-title font-semibold">{progress.skips}</dd></div>
      <div class="border-b border-border pb-2"><dt class="text-meta text-muted-foreground">Scheduled (current content)</dt>
        <dd class="text-title font-semibold">{progress.activeScheduled}</dd></div>
    </dl>
    <h3 class="mt-6 text-ui font-medium">Recent practice activity</h3>
    {#if progress.recent.length===0}
      <p class="mt-2 text-ui text-muted-foreground">No recorded practice yet.</p>
    {:else}
      <ol class="mt-3 divide-y divide-border border-t border-border">
        {#each progress.recent as item (item.attemptId)}
          <li class="flex flex-wrap items-start justify-between gap-2 py-3">
            <div class="min-w-0 flex-1">
              <p class="break-words text-ui">{item.prompt}</p>
              <p class="mt-1 text-meta text-muted-foreground">
                {kindLabel(item.kind,item.rating)} · {item.islandId}
              </p>
            </div>
            <time class="text-meta text-muted-foreground" datetime={formatISO(item.recordedAt)}>
              {formatDate(item.recordedAt)}
            </time>
          </li>
        {/each}
      </ol>
    {/if}
    <p class="mt-3 text-meta text-muted-foreground">
      Progress is based on committed attempts. Listening and shadowing are not recall scores.
    </p>
  {/if}
</section>
