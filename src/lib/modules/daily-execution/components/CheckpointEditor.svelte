<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import type { ExecutionTask } from '../core/planning.ts';
  let { task, onSave, onCancel }: {
    task: ExecutionTask;
    onSave: (lastCompleted: string, blocker: string, nextAction: string) => void;
    onCancel: () => void;
  } = $props();
  let lastCompleted = $state(task.checkpoint?.lastCompleted ?? '');
  let blocker = $state(task.checkpoint?.blocker ?? '');
  let nextAction = $state(task.checkpoint?.nextAction ?? task.nextAction);
</script>

<form class="mt-4 grid gap-3 rounded-xl border border-border bg-card p-4"
  onsubmit={(event) => { event.preventDefault(); if (nextAction.trim()) onSave(lastCompleted, blocker, nextAction); }}>
  <div class="text-meta font-semibold">RESUME CHECKPOINT · {task.title}</div>
  <label class="grid gap-1 text-meta font-medium">Last completed
    <textarea class="min-h-14 rounded-lg border border-input p-3 text-ui font-normal" maxlength="350" bind:value={lastCompleted} placeholder="What already works?"></textarea>
  </label>
  <label class="grid gap-1 text-meta font-medium">Current blocker
    <textarea class="min-h-14 rounded-lg border border-input p-3 text-ui font-normal" maxlength="350" bind:value={blocker} placeholder="What is still stuck?"></textarea>
  </label>
  <label class="grid gap-1 text-meta font-medium">Next concrete action
    <textarea class="min-h-14 rounded-lg border border-input p-3 text-ui font-normal" maxlength="350" required bind:value={nextAction} placeholder="Where exactly will you resume?"></textarea>
  </label>
  <div class="flex justify-end gap-2">
    <Button type="button" variant="ghost" class="rounded-full" onclick={onCancel}>Cancel</Button>
    <Button type="submit" class="rounded-full" disabled={!nextAction.trim()}>Save checkpoint</Button>
  </div>
</form>
