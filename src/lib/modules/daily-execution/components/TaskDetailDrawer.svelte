<script lang="ts">
 import { X } from 'lucide-svelte';
 import { onMount } from 'svelte';
 import { Button } from '#lib/components/ui/button/index.js';
 import type { ExecutionTask } from '../core/planning.ts';
 let { task, onClose, onSave, onArchive, onRemoveFromToday, onDetach }: {
   task: ExecutionTask;
   onClose: () => void;
   onSave: (fields: { title: string; context: string; nextAction: string; estimateMinutes: number; dueDate: string }) => boolean;
   onArchive: () => void;
   onRemoveFromToday?: () => void;
   onDetach?: () => void;
 } = $props();
 let title = $state('');
 let context = $state('');
 let nextAction = $state('');
 let estimate = $state('');
 let dueDate = $state('');
 let expanded = $state(false);
 let dialog: HTMLDivElement;
 onMount(() => {
   const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
   dialog?.querySelector<HTMLInputElement>('input')?.focus();
   return () => { if (previous?.isConnected) previous.focus(); };
 });
 $effect(() => {
   title = task.title;
   context = task.context ?? (task.workstream === 'general' ? '' : task.workstream);
   nextAction = task.nextAction;
   estimate = task.estimateMinutes ? String(task.estimateMinutes) : '';
   dueDate = task.dueDate ?? '';
 });
 function submit(event: SubmitEvent) {
   event.preventDefault();
   if (onSave({ title, context, nextAction, estimateMinutes: estimate.trim() ? Number(estimate) : 0, dueDate })) onClose();
 }
 function keydown(event: KeyboardEvent) {
   if (event.key === 'Escape') {
     event.preventDefault();
     onClose();
     return;
   }
   if (event.key !== 'Tab' || !dialog) return;
   const focusable = [...dialog.querySelectorAll<HTMLElement>(
     'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
   )].filter(node => node.getClientRects().length > 0);
   if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
   const first = focusable[0];
   const last = focusable[focusable.length - 1];
   if (!dialog.contains(document.activeElement) ||
     (event.shiftKey && document.activeElement === first) ||
     (!event.shiftKey && document.activeElement === last)) {
     event.preventDefault();
     (event.shiftKey ? last : first).focus();
   }
 }
</script>
<svelte:window onkeydown={keydown}/>
<div class="fixed inset-0 z-50 flex justify-end bg-foreground/30">
 <button class="absolute inset-0 cursor-default" type="button" aria-label="Close activity details" onclick={onClose}></button>
 <div bind:this={dialog} role="dialog" aria-modal="true" aria-labelledby="daily-task-heading" tabindex="-1" class="relative z-10 flex h-full w-full max-w-[390px] flex-col overflow-y-auto border-l border-border bg-card shadow-xl">
   <header class="flex items-center justify-between border-b border-border px-5 py-4">
     <h2 id="daily-task-heading" class="text-title font-medium">Activity details</h2>
     <Button variant="ghost" size="icon" aria-label="Close" onclick={onClose}><X class="size-4"/></Button>
   </header>
   <form onsubmit={submit} class="grid gap-4 p-5">
     {#if task.source}
       <div class="rounded-lg border border-border bg-muted/30 p-3 text-meta text-muted-foreground">
         <p class="font-medium text-foreground">Linked from {task.source.providerId}</p>
         <p class="mt-1">Completion here is local. The original task will not be changed.</p>
         <div class="mt-2 flex items-center gap-3">
           {#if task.source.url}
             <a href={task.source.url} target="_blank" rel="noopener noreferrer" class="font-medium text-primary underline underline-offset-2">Open original</a>
           {/if}
           {#if onDetach}
             <button type="button" class="font-medium text-muted-foreground underline underline-offset-2" onclick={onDetach}>Detach source</button>
           {/if}
         </div>
       </div>
     {/if}
     <label class="grid gap-1 text-meta font-medium">Activity
       <input class="h-10 rounded-lg border border-input bg-card px-3 text-ui" bind:value={title} maxlength="120" required/>
     </label>
     <label class="grid gap-1 text-meta font-medium">Notes / next step (optional)
       <textarea class="min-h-20 rounded-lg border border-input bg-card p-3 text-ui" bind:value={nextAction} maxlength="240"></textarea>
     </label>
     <button type="button" class="justify-self-start text-meta text-muted-foreground hover:text-foreground" aria-expanded={expanded} onclick={() => expanded = !expanded}>
       {expanded ? 'Hide details −' : 'More details +'}
     </button>
     {#if expanded}
       <label class="grid gap-1 text-meta font-medium">Context (optional)
         <input class="h-10 rounded-lg border border-input bg-card px-3 text-ui" bind:value={context} maxlength="60" placeholder="Any context"/>
       </label>
       <label class="grid gap-1 text-meta font-medium">Estimate in minutes (optional)
         <input class="h-10 rounded-lg border border-input bg-card px-3 text-ui" type="number" min="1" max="720" bind:value={estimate} placeholder="No estimate"/>
       </label>
       <label class="grid gap-1 text-meta font-medium">Deadline (optional)
         <input class="h-10 rounded-lg border border-input bg-card px-3 text-ui" type="date" bind:value={dueDate}/>
       </label>
     {/if}
     {#if task.checkpoint}
       <div class="rounded-xl bg-muted/50 p-3 text-meta">
         <p class="font-medium">Last checkpoint</p>
         <p class="mt-2 text-muted-foreground">{task.checkpoint.nextAction}</p>
       </div>
     {/if}
     <div class="mt-2 flex flex-wrap justify-end gap-2">
       {#if onRemoveFromToday}
         <Button type="button" variant="ghost" class="rounded-lg text-muted-foreground" onclick={onRemoveFromToday}>Remove from Today</Button>
       {/if}
       {#if task.status !== 'done'}
         <Button type="button" variant="ghost" class="rounded-lg text-muted-foreground" onclick={onArchive}>
           {task.status === 'blocked' ? 'Unblock' : task.status === 'archived' ? 'Restore' : 'Archive'}
         </Button>
       {/if}
       <Button type="button" variant="outline" class="rounded-lg" onclick={onClose}>Cancel</Button>
       <Button type="submit" class="rounded-lg" disabled={!title.trim()}>Save</Button>
     </div>
   </form>
 </div>
</div>