<script lang="ts">
 import { Button } from '#lib/components/ui/button/index.js';
 import { Search, Link2 } from 'lucide-svelte';
 import ConnectedSources from './ConnectedSources.svelte';
 import QuickCapture from './QuickCapture.svelte';
 import TaskDetailDrawer from './TaskDetailDrawer.svelte';
 import type { ExecutionTask } from '../core/planning.ts';
 import type { DailyExecutionController } from '../controller/daily-execution.svelte.ts';

 let { controller }: { controller: DailyExecutionController } = $props();
 let filter = $state<'all' | 'today' | 'available' | 'done'>('all');
 let editing = $state<ExecutionTask | null>(null);
 let query = $state('');
 let showSources = $state(false);
 let visibleLimit = $state(20);
 function changeFilter(value: typeof filter) { filter = value; visibleLimit = 20; }
 function searchChanged() { visibleLimit = 20; }
 const todayIds = $derived(new Set(controller.todayTasks.map(t => t.id)));
 const matching = $derived(controller.state.tasks
   .filter(task => {
     const inFilter = filter === 'all' || (filter === 'today' && todayIds.has(task.id)) ||
       (filter === 'available' && !todayIds.has(task.id) && task.status === 'ready') ||
       (filter === 'done' && task.status === 'done');
     const search = query.trim().toLocaleLowerCase();
     return inFilter && (!search || (task.title + ' ' + (task.context ?? '') + ' ' +
       (task.workstream === 'general' ? '' : task.workstream)).toLocaleLowerCase().includes(search));
   })
   .sort((a,b) => a.createdAt - b.createdAt));
 const visible = $derived(matching.slice(0,visibleLimit));
</script>
<header class="mb-5">
 <h1 class="text-page-title font-semibold">All activities</h1>
 <p class="mt-1 text-meta text-muted-foreground">Everything in one place. Choose what belongs in Today.</p>
</header>
<section class="rounded-[20px] border border-border bg-card p-4 sm:p-5">
 <QuickCapture onAdd={title => controller.quickAdd(title,'all')}/>
 <div class="mt-3 flex justify-end">
   <Button size="sm" variant="ghost" class="min-h-10 rounded-lg text-meta text-muted-foreground"
     aria-expanded={showSources} onclick={() => showSources=!showSources}>
     <Link2 class="mr-1 size-4"/> {showSources?'Hide sources':'Activity sources'}
     {#if controller.state.sourceConnections.length}({controller.state.sourceConnections.length}){/if}
   </Button>
 </div>
 {#if showSources}<ConnectedSources {controller}/>{/if}
 <div class="mb-4 mt-5 flex flex-wrap gap-2">
   {#each [['all','All'],['today','Today'],['available','Not planned'],['done','Completed']] as entry}
     {@const key = entry[0] as typeof filter}
     <Button size="sm" variant={filter === key ? 'secondary' : 'ghost'} class="h-8 rounded-full text-meta" aria-pressed={filter === key} onclick={() => changeFilter(key)}>{entry[1]}</Button>
   {/each}
 </div>
 <div class="relative mb-3">
   <Search class="absolute left-3 top-3 size-4 text-muted-foreground"/>
   <input bind:value={query} oninput={searchChanged} aria-label="Search all activities" placeholder="Find an activity..."
     class="h-10 w-full rounded-lg border border-input bg-muted/25 pl-9 pr-3 text-ui outline-none focus:border-primary"/>
 </div>
 <p class="mb-2 text-meta text-muted-foreground" role="status">{matching.length} {matching.length === 1 ? 'activity' : 'activities'} found</p>
 <div class="divide-y divide-border border-t border-border">
   {#each visible as task (task.id)}
     <div class="flex min-h-14 items-center gap-2 py-2">
       <button type="button" class="flex size-10 shrink-0 items-center justify-center" aria-label={(task.status === 'done' ? 'Reopen ' : 'Complete ') + task.title}
         disabled={task.status === 'blocked' || task.status === 'archived'}
         onclick={() => task.status === 'done' ? controller.reopenQuick(task.id) : controller.completeQuick(task.id)}>
         <span class={task.status === 'done' ? 'flex size-[18px] items-center justify-center rounded-full bg-primary text-primary-foreground' : 'size-[18px] rounded-full border border-muted-foreground/50'}>{task.status === 'done' ? '✓' : ''}</span>
       </button>
       <button type="button" class="min-w-0 flex-1 py-1 text-left" onclick={() => editing = task}>
         <span class="block truncate text-ui font-medium" class:line-through={task.status === 'done'}>{task.title}</span>
         <span class="text-meta text-muted-foreground">{task.source ? task.source.providerId+' · Linked'+(controller.state.sourceConnections.some(c=>c.id===task.source?.connectionId)?'':' · Disconnected') : (task.context ?? (task.workstream !== 'general' ? task.workstream : 'No context'))}{task.status === 'blocked' ? ' · Blocked' : ''}{task.status === 'archived' ? ' · Archived' : ''}</span>
       </button>
       {#if task.status === 'ready'}
         <Button variant="ghost" size="sm" class="h-8 rounded-lg px-2 text-meta" onclick={() => todayIds.has(task.id) ? controller.removeFromToday(task.id) : controller.addToToday(task.id)}>
           {todayIds.has(task.id) ? 'Remove' : '+ Today'}
         </Button>
       {:else if task.status === 'blocked' || task.status === 'archived'}
         <Button variant="ghost" size="sm" class="h-8 rounded-lg px-2 text-meta" onclick={() => controller.setTaskStatus(task.id, 'ready')}>
           {task.status === 'blocked' ? 'Unblock' : 'Restore'}
         </Button>
       {/if}
     </div>
   {:else}
     <p class="py-8 text-center text-meta text-muted-foreground">{query.trim() ? 'No matching activities.' : 'No activities here yet.'}</p>
   {/each}
 </div>
 {#if matching.length > visible.length}
   <div class="mt-3 flex justify-center">
     <Button size="sm" variant="ghost" class="rounded-lg text-meta" onclick={() => visibleLimit += 20}>
       Show {Math.min(20,matching.length - visible.length)} more
     </Button>
   </div>
 {/if}
</section>
{#if editing}
 {#key editing.id}
   <TaskDetailDrawer task={editing} onClose={() => editing = null}
     onSave={fields => controller.editSimple(editing?.id ?? '', fields, editing ?? undefined)}
     onDetach={() => { if (controller.detachLinked(editing?.id ?? '')) editing = null; }}
     onArchive={() => { if (editing?.status === 'archived' || editing?.status === 'blocked') controller.setTaskStatus(editing.id, 'ready'); else controller.archiveSimple(editing?.id ?? ''); editing = null; }}/>
 {/key}
{/if}