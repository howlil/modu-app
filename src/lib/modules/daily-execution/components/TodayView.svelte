<script lang="ts">
  import { Play, Check, ArrowRight, Target } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import CheckpointEditor from './CheckpointEditor.svelte';
  import { WORKSTREAM_NAMES, type CapacityMode, type Workstream } from '../core/planning.ts';
  import type { DailyExecutionController } from '../controller/daily-execution.svelte.ts';

  let { controller }: { controller: DailyExecutionController } = $props();
  let goalDraft = $state('');
  let criteriaDraft = $state('');
  let completingId = $state<string | null>(null);
  let outcomeDraft = $state('');
  let evidenceDraft = $state('');
  let showAllocations = $state(false);
  let showReplan = $state(false);
  let editingCheckpointId = $state<string | null>(null);
  const workstreams = Object.keys(WORKSTREAM_NAMES) as Workstream[];
  const recordedMinutes = $derived(controller.recordedMs / 60_000);
  const suggested = $derived(controller.recommendation);
  const remaining = $derived(Math.max(0, controller.plannedMinutes - recordedMinutes));
  const checkpointId = $derived(editingCheckpointId ?? controller.checkpointPromptId);
  const checkpointTask = $derived(controller.state.tasks.find((t) => t.id === checkpointId) ?? null);

  function saveOutcome() {
    if (!completingId || !outcomeDraft.trim()) return;
    controller.completeTask(completingId, outcomeDraft, evidenceDraft);
    completingId = null;
    outcomeDraft = '';
    evidenceDraft = '';
  }
</script>

{#if !controller.state.goal}
  <section class="mx-auto max-w-[560px] rounded-[20px] border border-border bg-card p-6">
    <div class="mb-5 flex items-center gap-2 text-title font-semibold"><Target class="size-5 text-primary" /> Start with one goal</div>
    <label class="mb-2 block text-meta font-medium" for="daily-goal">What are you working toward?</label>
    <input id="daily-goal" class="mb-4 h-11 w-full rounded-lg border border-input bg-card px-3 text-ui" bind:value={goalDraft} maxlength="120" placeholder="e.g. Get hired as Backend Engineer" />
    <label class="mb-2 block text-meta font-medium" for="daily-criteria">What would success look like? (optional)</label>
    <input id="daily-criteria" class="mb-5 h-11 w-full rounded-lg border border-input bg-card px-3 text-ui" bind:value={criteriaDraft} maxlength="240" placeholder="e.g. Accept a backend offer" />
    <Button class="rounded-full" disabled={!goalDraft.trim()} onclick={() => controller.setGoal(goalDraft, criteriaDraft)}>Create goal <ArrowRight class="ml-1 size-4" /></Button>
  </section>
{:else}
  <div class="mb-5 text-meta text-muted-foreground">PRIMARY GOAL <span class="ml-2 font-medium text-foreground">{controller.state.goal}</span></div>
  <Card.Root class="mb-3 gap-3 rounded-[20px] p-5 shadow-none">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="text-meta text-muted-foreground">DAILY CAPACITY</div>
        <div class="mt-1 text-title-lg font-semibold">{controller.minutesLabel(controller.plannedMinutes)} <span class="text-meta font-normal text-muted-foreground">work budget</span></div>
      </div>
      <div class="flex flex-wrap gap-1 rounded-full bg-muted p-1" role="group" aria-label="Daily capacity">
        {#each ['low','medium','high'] as mode}
          {@const selectedMode = mode as CapacityMode}
          <Button size="sm" variant="ghost" aria-pressed={controller.plan.mode === selectedMode}
            class={controller.plan.mode === selectedMode ? 'h-8 rounded-full bg-card px-3 text-meta text-primary shadow-sm hover:bg-card' : 'h-8 rounded-full px-3 text-meta text-muted-foreground shadow-none'}
            onclick={() => controller.setMode(selectedMode)}>{mode === 'low' ? 'Low · 6h' : mode === 'medium' ? 'Medium · 8h' : 'High · 12h'}</Button>
        {/each}
      </div>
    </div>
    <div class="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Recorded work relative to work budget" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(100, Math.round(100 * recordedMinutes / Math.max(1, controller.plannedMinutes)))}>
      <div class="h-full rounded-full bg-primary" style:width={Math.min(100, 100 * recordedMinutes / Math.max(1, controller.plannedMinutes)) + '%'}></div>
    </div>
    <div class="flex justify-between gap-2 text-meta text-muted-foreground">
      <span><strong class="font-medium text-foreground">{controller.minutesLabel(recordedMinutes)}</strong> recorded ({controller.minutesLabel(controller.focusRecordedMs / 60_000)} focus + {controller.minutesLabel(controller.manualRecordedMs / 60_000)} manual)</span>
      <span>{controller.minutesLabel(remaining)} budget not recorded</span>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      <span class="text-meta text-muted-foreground">Remaining work can be reallocated without changing past activity.</span>
      <Button size="sm" variant="outline" class="rounded-full" onclick={() => showReplan = !showReplan}>{showReplan ? 'Close replan' : 'Replan remaining time'}</Button>
    </div>
    {#if showReplan}
      <div class="rounded-xl border border-border bg-muted/35 p-4">
        <div class="text-meta font-semibold">SUGGESTED REMAINING ALLOCATION</div>
        <p class="mt-2 text-meta text-muted-foreground">{controller.replanProposal.reason}</p>
        <div class="mt-4 grid gap-3">
          {#each workstreams as workstream}
            <div>
              <div class="mb-1 flex justify-between text-meta"><span>{WORKSTREAM_NAMES[workstream]}</span><span>{controller.minutesLabel(controller.replanProposal.allocations[workstream])}</span></div>
              <div class="h-1.5 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full bg-primary" style:width={controller.replanProposal.remainingMinutes ? Math.min(100, 100 * controller.replanProposal.allocations[workstream] / controller.replanProposal.remainingMinutes) + '%' : '0%'}></div></div>
            </div>
          {/each}
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" class="rounded-full" onclick={() => showReplan = false}>Keep plan</Button>
          <Button size="sm" class="rounded-full" onclick={() => { controller.acceptReplan(); showReplan = false; }}>Accept replan</Button>
        </div>
      </div>
    {:else if controller.plan.revision}
      <div class="text-meta text-muted-foreground">Accepted replan: {controller.plan.revision.reason}</div>
    {/if}
    <button class="w-fit text-meta text-muted-foreground underline-offset-4 hover:underline" onclick={() => showAllocations = !showAllocations} aria-expanded={showAllocations}>Edit workstream allocations {showAllocations ? '−' : '+'}</button>
    {#if showAllocations}
      <div class="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
        {#each workstreams as workstream}
          <label class="flex items-center justify-between gap-2 text-meta">
            <span>{WORKSTREAM_NAMES[workstream]}</span>
            <input class="h-9 w-20 rounded-lg border border-input bg-card px-2 text-right tabular-nums" type="number" min="0" max="720" step="5" value={controller.plan.allocations[workstream]}
              aria-label={WORKSTREAM_NAMES[workstream] + ' allocation minutes'} onchange={(e) => controller.setAllocation(workstream, Number(e.currentTarget.value))} />
          </label>
        {/each}
      </div>
      <p class="text-meta text-muted-foreground">Minutes per workstream. Adjusting allocations changes the planned budget, not past sessions.</p>
    {/if}
  </Card.Root>

  {#if suggested}
    <section class="mb-3 rounded-[20px] border border-[#DCE7FF] bg-[linear-gradient(125deg,#F5F8FF,#EAF1FF)] p-6">
      <div class="text-meta font-semibold text-secondary-foreground">NEXT VALUABLE ACTION</div>
      <h2 class="mt-4 text-title-lg font-semibold tracking-[-0.03em]">{suggested.title}</h2>
      <p class="mt-2 text-ui text-[#596678]">{suggested.checkpoint?.nextAction || suggested.nextAction}</p>
      {#if suggested.checkpoint}
        <div class="mt-4 grid gap-2 border-t border-[#DCE7FF] pt-4 text-meta">
          <div><span class="font-medium text-secondary-foreground">Last completed:</span> {suggested.checkpoint.lastCompleted || 'Not set'}</div>
          {#if suggested.checkpoint.blocker}<div><span class="font-medium text-secondary-foreground">Blocker:</span> {suggested.checkpoint.blocker}</div>{/if}
          <div><span class="font-medium text-secondary-foreground">Resume:</span> {suggested.checkpoint.nextAction}</div>
        </div>
      {/if}
      <div class="mt-4 text-meta text-muted-foreground">{WORKSTREAM_NAMES[suggested.workstream]} · {suggested.impact} impact · {controller.minutesLabel(suggested.estimateMinutes)} estimated · {controller.minutesLabel(controller.focusMsForTask(suggested.id) / 60_000)} recorded</div>
      <div class="mt-5 flex flex-wrap items-center gap-2">
        <Button class="rounded-full" onclick={() => controller.openFocus(suggested)}><Play class="mr-1 size-4" /> Focus in Pomodoro</Button>
        <Button variant="ghost" class="rounded-full text-muted-foreground" onclick={() => { editingCheckpointId = suggested.id; controller.checkpointPromptId = null; }}>Checkpoint</Button>
        <Button variant="ghost" class="rounded-full text-muted-foreground" onclick={() => { completingId = suggested.id; outcomeDraft = ''; evidenceDraft = ''; }}><Check class="mr-1 size-4" /> Mark done</Button>
      </div>
      {#if checkpointTask && checkpointTask.id === suggested.id}
        {#key checkpointTask.id}
          <CheckpointEditor task={checkpointTask}
            onSave={(last, blocker, next) => { controller.saveCheckpoint(checkpointTask.id, last, blocker, next); editingCheckpointId = null; }}
            onCancel={() => { editingCheckpointId = null; controller.checkpointPromptId = null; }}/>
        {/key}
      {/if}
      {#if completingId === suggested.id}
        <form class="mt-5 grid gap-3 rounded-xl border border-border bg-card p-4" onsubmit={(e) => { e.preventDefault(); saveOutcome(); }}>
          <label class="text-meta font-medium" for="outcome">What did you accomplish?</label>
          <textarea id="outcome" class="min-h-20 w-full rounded-lg border border-input p-3 text-ui" maxlength="1000" required bind:value={outcomeDraft} placeholder="Concrete output or learning evidence"></textarea>
          <input class="h-10 rounded-lg border border-input px-3 text-ui" aria-label="Evidence URL optional" type="url" maxlength="400" bind:value={evidenceDraft} placeholder="Evidence URL (optional)" />
          <div class="flex justify-end gap-2"><Button type="button" variant="ghost" onclick={() => completingId = null}>Cancel</Button><Button type="submit" disabled={!outcomeDraft.trim()}>Save outcome</Button></div>
        </form>
      {/if}
    </section>
  {:else}
    <Card.Root class="mb-3 rounded-[20px] p-6 shadow-none">
      <h2 class="text-title-lg font-medium">No ready tasks</h2>
      <p class="text-ui text-muted-foreground">Add your first actionable task in Priorities.</p>
      <Button variant="outline" class="mt-3 w-fit rounded-full" onclick={() => controller.view = 'priorities'}>Open priorities</Button>
    </Card.Root>
  {/if}

  {#if checkpointTask && checkpointTask.id !== suggested?.id}
    <section class="mb-3 rounded-[20px] border border-border bg-card p-4">
      <CheckpointEditor task={checkpointTask}
        onSave={(last, blocker, next) => { controller.saveCheckpoint(checkpointTask.id, last, blocker, next); editingCheckpointId = null; }}
        onCancel={() => { editingCheckpointId = null; controller.checkpointPromptId = null; }}/>
    </section>
  {/if}
  <section class="overflow-hidden rounded-[20px] border border-border bg-card">
    <div class="flex items-center justify-between p-4"><h3 class="text-title font-medium">Up next</h3><Button variant="ghost" size="sm" class="rounded-full text-meta text-muted-foreground" onclick={() => controller.view = 'priorities'}>Manage priorities <ArrowRight class="ml-1 size-3.5" /></Button></div>
    {#each controller.queue.filter((task) => task.id !== suggested?.id).slice(0, 3) as task}
      <div class="flex items-center gap-3 border-t border-border px-4 py-3">
        <span class="size-2 rounded-full border border-muted-foreground"></span>
        <div class="min-w-0 flex-1"><div class="truncate text-ui font-medium">{task.title}</div><div class="text-meta text-muted-foreground">{WORKSTREAM_NAMES[task.workstream]} · {controller.minutesLabel(task.estimateMinutes)}</div></div>
        <Button variant="ghost" size="sm" class="rounded-full text-meta text-primary" onclick={() => controller.openFocus(task)}>Focus →</Button>
      </div>
    {:else}
      <p class="border-t border-border p-5 text-meta text-muted-foreground">No additional ready tasks.</p>
    {/each}
  </section>
  <p class="mt-4 text-meta text-muted-foreground">Work budget is tracked only where focus sessions or manual entries have been recorded; breaks are excluded.</p>
{/if}
