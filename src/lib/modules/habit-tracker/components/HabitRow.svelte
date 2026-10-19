<script lang="ts">
  import { Check, Pencil, Archive, ArchiveRestore, Trash2 } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import type { HabitDefinition } from '../core/types.ts';

  let {
    habit, completed = false, busy = false, confirming = false,
    onToggle, onEdit, onArchive, onDelete, onConfirmDelete, onCancelDelete
  }: {
    habit: HabitDefinition;
    completed?: boolean;
    busy?: boolean;
    confirming?: boolean;
    onToggle: () => void;
    onEdit: () => void;
    onArchive: () => void;
    onDelete: () => void;
    onConfirmDelete: () => void;
    onCancelDelete: () => void;
  } = $props();

  const archived = $derived(habit.status === 'ARCHIVED');
</script>

<div class="border-b border-border last:border-b-0">
  <div class="flex min-h-16 items-center gap-2 py-3">
    {#if !archived}
      <button
        type="button"
        class={completed
          ? 'flex size-10 shrink-0 items-center justify-center rounded-full border border-secondary bg-secondary text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
          : 'flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'}
        aria-label={(completed ? 'Uncheck ' : 'Complete ') + habit.title}
        aria-pressed={completed}
        disabled={busy}
        onclick={onToggle}
      >
        {#if completed}<Check class="size-5" strokeWidth={2} />{:else}<span class="size-4 rounded-full border border-muted-foreground/50"></span>{/if}
      </button>
    {:else}
      <div class="flex size-10 shrink-0 items-center justify-center text-muted-foreground"><Archive class="size-4"/></div>
    {/if}
    <div class="min-w-0 flex-1">
      <div class="truncate text-ui font-medium">{habit.title}</div>
      <div class="text-meta text-muted-foreground">{archived ? 'Archived' : completed ? 'Completed today' : 'Daily · Check-off'}</div>
    </div>
    <div class="flex shrink-0 items-center gap-0.5">
      <Button variant="ghost" size="icon" class="size-9 rounded-lg" title="Edit" aria-label={'Edit ' + habit.title} disabled={busy} onclick={onEdit}>
        <Pencil class="size-4" strokeWidth={1.7}/>
      </Button>
      <Button variant="ghost" size="icon" class="size-9 rounded-lg" title={archived ? 'Restore' : 'Archive'} aria-label={(archived ? 'Restore ' : 'Archive ') + habit.title} disabled={busy} onclick={onArchive}>
        {#if archived}<ArchiveRestore class="size-4" strokeWidth={1.7}/>{:else}<Archive class="size-4" strokeWidth={1.7}/>{/if}
      </Button>
      <Button variant="ghost" size="icon" class="size-9 rounded-lg text-destructive" title="Delete" aria-label={'Delete ' + habit.title} disabled={busy} onclick={onDelete}>
        <Trash2 class="size-4" strokeWidth={1.7}/>
      </Button>
    </div>
  </div>
  {#if confirming}
    <div role="group" aria-label={'Delete confirmation for ' + habit.title} class="mb-3 rounded-lg border border-destructive/20 bg-muted/50 p-3">
      <p class="text-ui">Delete <strong>{habit.title}</strong> and all its records permanently?</p>
      <div class="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" class="rounded-full" disabled={busy} onclick={onCancelDelete}>Cancel</Button>
        <Button variant="destructive" size="sm" class="rounded-full" disabled={busy} onclick={onConfirmDelete}>Delete permanently</Button>
      </div>
    </div>
  {/if}
</div>
