<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import type { DailyExecutionController } from '../controller/daily-execution.svelte.ts';
  import type { EvidenceKind, EvidenceRecord } from '../core/evidence.ts';

  let {controller}: {controller: DailyExecutionController} = $props();
  let kind = $state<EvidenceKind | 'all'>('all');
  let adding = $state(false);
  let title = $state('');
  let observation = $state('');
  let topic = $state('');
  let result = $state<'informational'|'needs-practice'|'passed'>('informational');
  let taskId = $state('');
  let recordKind = $state<EvidenceKind>('deliverable');
  let evidenceUrl = $state('');
  const kinds: {label:string;value:EvidenceKind}[] = [
    {label:'Deliverable',value:'deliverable'}, {label:'Assessment',value:'assessment'},
    {label:'Application',value:'application'}, {label:'Interview',value:'interview'}, {label:'Milestone',value:'milestone'}
  ];
  const visible = $derived(controller.combinedEvidence.filter((record) => kind === 'all' || record.kind === kind));
  async function submit() {
    const saved = await controller.addEvidence({
      title,observation,kind:recordKind,taskId:taskId || undefined,
      topic:recordKind==='assessment'?topic:undefined,
      assessmentResult:recordKind==='assessment'?result:undefined,
      url:evidenceUrl
    });
    if(saved){adding=false;title='';observation='';topic='';taskId='';evidenceUrl='';result='informational';}
  }
</script>

<div class="grid gap-4">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div><h3 class="text-title-lg font-semibold">Evidence</h3><p class="mt-1 text-meta text-muted-foreground">Outcome records and observable supporting material.</p></div>
    <Button size="sm" class="rounded-full" onclick={()=>adding=!adding}>{adding ? 'Close' : '+ Add evidence'}</Button>
  </div>
  {#if adding}
    <form class="grid gap-3 rounded-[20px] border border-border bg-card p-5" onsubmit={async (event)=>{event.preventDefault();await submit();}}>
      <label class="grid gap-1 text-meta font-medium">Title<input class="h-10 rounded-lg border border-input px-3 text-ui font-normal" required maxlength="160" bind:value={title} /></label>
      <label class="grid gap-1 text-meta font-medium">What is observable?<textarea class="min-h-20 rounded-lg border border-input p-3 text-ui font-normal" required maxlength="800" bind:value={observation}></textarea></label>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="grid gap-1 text-meta font-medium">Kind<select class="h-10 rounded-lg border border-input bg-card px-2 text-ui" bind:value={recordKind}>{#each kinds as entry}<option value={entry.value}>{entry.label}</option>{/each}</select></label>
        <label class="grid gap-1 text-meta font-medium">Linked task (optional)<select class="h-10 min-w-0 rounded-lg border border-input bg-card px-2 text-ui" bind:value={taskId}><option value="">None</option>{#each controller.state.tasks as task}<option value={task.id}>{task.title}</option>{/each}</select></label>
      </div>
      {#if recordKind === 'assessment'}
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="grid gap-1 text-meta font-medium">Assessed topic<input class="h-10 rounded-lg border border-input px-3 text-ui font-normal" maxlength="80" bind:value={topic} placeholder="e.g. Java concurrency" /></label>
          <label class="grid gap-1 text-meta font-medium">Result<select class="h-10 rounded-lg border border-input bg-card px-2 text-ui" bind:value={result}><option value="informational">Informational</option><option value="needs-practice">Needs practice</option><option value="passed">Passed</option></select></label>
        </div>
      {/if}
      <label class="grid gap-1 text-meta font-medium">Evidence URL (optional)<input type="url" class="h-10 rounded-lg border border-input px-3 text-ui font-normal" maxlength="500" bind:value={evidenceUrl} placeholder="https://" /></label>
      <div class="flex justify-end gap-2">
        <Button type="button" variant="ghost" class="rounded-full" onclick={()=>adding=false}>Cancel</Button>
        <Button type="submit" disabled={!title.trim() || !observation.trim()} class="rounded-full">Save evidence</Button>
      </div>
    </form>
  {/if}
  <label class="flex items-center justify-between gap-2 text-meta font-medium">Filter evidence
    <select class="h-10 rounded-lg border border-input bg-card px-3 text-ui" bind:value={kind}>
      <option value="all">All</option>{#each kinds as entry}<option value={entry.value}>{entry.label}</option>{/each}
    </select>
  </label>
  {#each visible as record}
    <article class="rounded-xl border border-border bg-card p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-ui font-medium">{record.title}</div>
          <p class="mt-2 text-meta text-muted-foreground">{record.observation}</p>
          {#if record.topic}<p class="mt-2 text-meta">Topic: {record.topic}{#if record.assessmentResult} · {record.assessmentResult.replace('-',' ')}{/if}</p>{/if}
          {#if record.url}<a class="mt-2 block break-all text-meta text-primary underline underline-offset-2" href={record.url} target="_blank" rel="noopener noreferrer">Open evidence ↗</a>{/if}
        </div>
        {#if record.source === 'manual'}
          <Button size="sm" variant="ghost" class="shrink-0 rounded-full text-meta text-muted-foreground" onclick={()=>controller.archiveEvidence(record.id)}>Archive</Button>
        {/if}
      </div>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-meta text-muted-foreground">
        <span>{record.kind} · {record.source}{#if record.taskId && controller.state.tasks.find((t)=>t.id===record.taskId)} · {controller.state.tasks.find((t)=>t.id===record.taskId)?.title}{/if}</span>
        <span>{record.verification.replace('-',' ')} · {new Date(record.occurredAt).toLocaleDateString()}</span>
      </div>
    </article>
  {:else}
    <div class="rounded-xl border border-border bg-card px-4 py-9 text-center text-meta text-muted-foreground">
      No evidence recorded in this category. Existing task outcomes will appear here automatically after completion.
    </div>
  {/each}
  <p class="text-meta text-muted-foreground">Evidence never adds focus duration or automatically completes tasks. User-reported records are not independently verified.</p>
</div>
