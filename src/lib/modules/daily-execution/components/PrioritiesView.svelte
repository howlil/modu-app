<script lang="ts">
  import { Plus, Play } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import { WORKSTREAM_NAMES, type Impact, type Workstream, type ExecutionTask } from '../core/planning.ts';
  import type { DailyExecutionController } from '../controller/daily-execution.svelte.ts';
  let { controller }: { controller: DailyExecutionController } = $props();
  let showForm = $state(false);
  let title = $state('');
  let nextAction = $state('');
  let workstream = $state<Workstream>('build');
  let impact = $state<Impact>('high');
  let effort = $state(45);
  let dueDate = $state('');
  let outcomeFor = $state<string | null>(null);
  let outcome = $state('');
  let evidence = $state('');
  let editId = $state<string | null>(null);
  let editTitle = $state('');
  let editAction = $state('');
  let editStream = $state<Workstream>('build');
  let editImpact = $state<Impact>('high');
  let editEffort = $state(45);
  let editDue = $state('');
  const workstreams = Object.keys(WORKSTREAM_NAMES) as Workstream[];
  function create() {
    if (!title.trim() || !nextAction.trim()) return;
    controller.addTask(title, nextAction, workstream, impact, effort, dueDate);
    title = ''; nextAction = ''; dueDate = ''; effort = 45; showForm = false;
  }
  function beginEdit(task: ExecutionTask) {
    editId = task.id;
    editTitle = task.title;
    editAction = task.nextAction;
    editStream = task.workstream;
    editImpact = task.impact;
    editEffort = task.estimateMinutes;
    editDue = task.dueDate ?? '';
  }
  function saveEdit() {
    if (!editId) return;
    controller.updateTask(editId, editTitle, editAction, editStream, editImpact, editEffort, editDue);
    editId = null;
  }
  function done() {
    if (outcomeFor && outcome.trim()) controller.completeTask(outcomeFor, outcome, evidence);
    outcomeFor = null; outcome = ''; evidence = '';
  }
</script>
<div class="mb-5 flex items-center justify-between gap-3"><div><h2 class="text-title-lg font-semibold">Priorities</h2><p class="mt-1 text-meta text-muted-foreground">Concrete actions, ordered by value.</p></div><Button variant="outline" class="rounded-full" onclick={() => showForm = !showForm}><Plus class="mr-1 size-4" /> Add task</Button></div>

{#if showForm}
  <form class="mb-4 grid gap-3 rounded-[20px] border border-border bg-card p-5" onsubmit={(e) => {e.preventDefault(); create();}}>
    <label class="text-meta font-medium" for="new-task">Task</label>
    <input id="new-task" required maxlength="120" class="h-10 w-full rounded-lg border border-input px-3 text-ui" bind:value={title} placeholder="Implement idempotent callback" />
    <label class="text-meta font-medium" for="new-action">Next concrete action</label>
    <textarea id="new-action" required maxlength="240" class="min-h-16 rounded-lg border border-input p-3 text-ui" bind:value={nextAction} placeholder="Write concurrent duplicate-event integration test"></textarea>
    <div class="grid grid-cols-2 gap-3">
      <label class="grid gap-1 text-meta">Workstream<select bind:value={workstream} class="h-10 rounded-lg border border-input bg-card px-2 text-ui">{#each workstreams as id}<option value={id}>{WORKSTREAM_NAMES[id]}</option>{/each}</select></label>
      <label class="grid gap-1 text-meta">Impact<select bind:value={impact} class="h-10 rounded-lg border border-input bg-card px-2 text-ui"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
      <label class="grid gap-1 text-meta">Estimated minutes<input type="number" min="1" max="720" required bind:value={effort} class="h-10 rounded-lg border border-input px-3 text-ui" /></label>
      <label class="grid gap-1 text-meta">Deadline (optional)<input type="date" bind:value={dueDate} class="h-10 min-w-0 rounded-lg border border-input px-2 text-ui" /></label>
    </div>
    <div class="flex justify-end gap-2"><Button type="button" variant="ghost" onclick={() => showForm = false}>Cancel</Button><Button type="submit" disabled={!title.trim() || !nextAction.trim()}>Add task</Button></div>
  </form>
{/if}

<div class="overflow-hidden rounded-[20px] border border-border bg-card">
  {#each [...controller.queue, ...controller.state.tasks.filter((t) => t.status !== 'ready')] as task}
    <div class="border-b border-border p-4 last:border-b-0">
      <div class="flex flex-wrap items-start gap-3">
        <span class={task.status === 'done' ? 'mt-2 size-2 shrink-0 rounded-full bg-[#247A54]' : 'mt-2 size-2 shrink-0 rounded-full border border-muted-foreground'}></span>
        <div class="min-w-0 flex-1">
          <div class="text-ui font-medium" class:text-muted-foreground={task.status === 'done'}>{task.title}</div>
          <p class="mt-1 text-meta text-muted-foreground">{task.nextAction}</p>
          <div class="mt-2 text-meta text-muted-foreground">{WORKSTREAM_NAMES[task.workstream]} · {task.impact} impact · {controller.minutesLabel(task.estimateMinutes)} estimate · {controller.minutesLabel(controller.focusMsForTask(task.id) / 60_000)} focus</div>
          {#if task.status === 'done' && task.outcome}<p class="mt-2 text-meta text-[#247A54]">{task.outcome}</p>{/if}
        </div>
        <div class="flex flex-wrap items-center gap-1">
          {#if task.status === 'ready'}
            <Button variant="ghost" size="sm" class="rounded-full text-meta" onclick={() => controller.openFocus(task)}><Play class="mr-1 size-3.5" /> Focus</Button>
            <Button variant="ghost" size="sm" class="rounded-full text-meta" onclick={() => beginEdit(task)}>Edit</Button>
            <Button variant="ghost" size="sm" class="rounded-full text-meta" onclick={() => { outcomeFor = task.id; outcome = ''; evidence = ''; }}>Done</Button>
            <Button variant="ghost" size="sm" class="rounded-full text-meta text-muted-foreground" onclick={() => controller.setTaskStatus(task.id, 'blocked')}>Block</Button>
          {:else if task.status === 'blocked'}
            <Button variant="ghost" size="sm" onclick={() => controller.setTaskStatus(task.id, 'ready')}>Unblock</Button>
            <Button variant="ghost" size="sm" onclick={() => beginEdit(task)}>Edit</Button>
          {:else if task.status === 'done'}
            <span class="text-meta text-muted-foreground">Completed</span>
          {/if}
          {#if task.status !== 'archived' && task.status !== 'done'}
            <Button variant="ghost" size="sm" class="rounded-full text-meta text-muted-foreground" onclick={() => controller.setTaskStatus(task.id, 'archived')}>Archive</Button>
          {:else if task.status === 'archived'}
            <Button variant="ghost" size="sm" onclick={() => controller.setTaskStatus(task.id, 'ready')}>Restore</Button>
          {/if}
        </div>
      </div>
      {#if editId === task.id}
        <form class="mt-3 grid gap-3 border-t border-border pt-3" onsubmit={(e) => {e.preventDefault(); saveEdit();}}>
          <label class="grid gap-1 text-meta font-medium">Title<input required maxlength="120" class="h-10 rounded-lg border border-input px-3 text-ui font-normal" bind:value={editTitle} /></label>
          <label class="grid gap-1 text-meta font-medium">Next action<textarea required maxlength="240" class="min-h-16 rounded-lg border border-input p-3 text-ui font-normal" bind:value={editAction}></textarea></label>
          <div class="grid grid-cols-2 gap-2">
            <label class="grid gap-1 text-meta">Workstream<select class="h-10 rounded-lg border border-input bg-card px-2" bind:value={editStream}>{#each workstreams as stream}<option value={stream}>{WORKSTREAM_NAMES[stream]}</option>{/each}</select></label>
            <label class="grid gap-1 text-meta">Impact<select class="h-10 rounded-lg border border-input bg-card px-2" bind:value={editImpact}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
            <label class="grid gap-1 text-meta">Minutes<input type="number" min="1" max="720" required class="h-10 rounded-lg border border-input px-3" bind:value={editEffort} /></label>
            <label class="grid gap-1 text-meta">Deadline<input type="date" class="h-10 rounded-lg border border-input px-3" bind:value={editDue} /></label>
          </div>
          <div class="flex justify-end gap-2"><Button type="button" variant="ghost" onclick={() => editId = null}>Cancel</Button><Button type="submit" disabled={!editTitle.trim() || !editAction.trim()}>Save changes</Button></div>
        </form>
      {/if}
      {#if outcomeFor === task.id}
        <form class="mt-3 grid gap-3 border-t border-border pt-3" onsubmit={(e) => {e.preventDefault(); done();}}>
          <label class="text-meta font-medium" for="task-outcome">What did you accomplish?</label>
          <textarea id="task-outcome" maxlength="1000" required bind:value={outcome} class="min-h-20 rounded-lg border border-input p-3 text-ui" placeholder="Verifiable result"></textarea>
          <input type="url" class="h-10 rounded-lg border border-input px-3 text-ui" placeholder="Evidence URL (optional)" aria-label="Evidence URL" bind:value={evidence} maxlength="400" />
          <div class="flex justify-end gap-2"><Button type="button" variant="ghost" onclick={() => outcomeFor = null}>Cancel</Button><Button type="submit" disabled={!outcome.trim()}>Save outcome</Button></div>
        </form>
      {/if}
    </div>
  {:else}
    <div class="p-8 text-center text-meta text-muted-foreground">No tasks yet. Add an actionable task to begin.</div>
  {/each}
</div>
