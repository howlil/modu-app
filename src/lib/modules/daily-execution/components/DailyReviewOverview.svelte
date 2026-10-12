<script lang="ts">
 import { Button } from '$lib/components/ui/button/index.js';
 import ReviewView from './ReviewView.svelte';
 import type { DailyExecutionController } from '../controller/daily-execution.svelte.ts';
 let { controller }: { controller: DailyExecutionController } = $props();
 let showDetails = $state(false);
 let note = $state('');
 let lastDay = $state('');
 const selected = $derived(controller.todayTasks);
 const done = $derived(selected.filter(task => task.status === 'done'));
 $effect(() => {
   if (!controller.loading && lastDay !== controller.dayKey) {
     lastDay = controller.dayKey;
     note = controller.dayNote;
   }
 });
</script>
<header class="mb-5">
 <h1 class="text-page-title font-semibold">Review</h1>
 <p class="mt-1 text-meta text-muted-foreground">A small look at what moved forward.</p>
</header>
<div class="mb-4 grid grid-cols-3 gap-2">
 <div class="rounded-xl border border-border bg-card p-3 sm:p-4"><p class="text-meta text-muted-foreground">Selected</p><strong class="text-title-lg font-medium tabular-nums">{selected.length}</strong></div>
 <div class="rounded-xl border border-border bg-card p-3 sm:p-4"><p class="text-meta text-muted-foreground">Completed</p><strong class="text-title-lg font-medium tabular-nums">{done.length}</strong></div>
 <div class="rounded-xl border border-border bg-card p-3 sm:p-4"><p class="text-meta text-muted-foreground">Focus</p><strong class="text-title-lg font-medium tabular-nums">{controller.minutesLabel(controller.focusRecordedMs / 60_000)}</strong></div>
</div>
<section class="rounded-[20px] border border-border bg-card p-5">
 <h2 class="text-title font-medium">Completed activities</h2>
 <div class="mt-3 divide-y divide-border">
   {#each done as task (task.id)}
     <div class="py-3 text-ui">{task.title}</div>
   {:else}
     <p class="py-5 text-meta text-muted-foreground">Nothing completed yet.</p>
   {/each}
 </div>
 <label class="mt-5 grid gap-2 text-meta font-medium">Anything to remember?
   <textarea class="min-h-24 rounded-lg border border-input bg-card p-3 text-ui font-normal" bind:value={note} maxlength="1000" placeholder="Optional reflection..."></textarea>
 </label>
 <div class="mt-3 flex justify-end">
   <Button size="sm" variant="outline" class="rounded-lg" onclick={() => controller.saveDayNote(note)}>Save note</Button>
 </div>
</section>
<section class="mt-4">
 <Button variant="ghost" size="sm" class="rounded-lg text-muted-foreground" aria-expanded={showDetails} onclick={() => showDetails = !showDetails}>
   {showDetails ? 'Hide detailed activity & insights −' : 'Detailed activity & insights +'}
 </Button>
 {#if showDetails}<div class="mt-3"><ReviewView {controller}/></div>{/if}
</section>