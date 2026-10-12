<script lang="ts">
 import { Play, Check, ChevronRight, ChevronDown, PanelRightClose, PanelRightOpen, Plus, Search } from 'lucide-svelte';
 import { Button } from '$lib/components/ui/button/index.js';
 import QuickCapture from './QuickCapture.svelte';
 import TaskDetailDrawer from './TaskDetailDrawer.svelte';
 import type { ExecutionTask } from '../core/planning.ts';
 import type { DailyExecutionController } from '../controller/daily-execution.svelte.ts';

 let { controller }: { controller: DailyExecutionController } = $props();
 let showShelf = $state(true);
 let mobileShelf = $state(false);
 let showDone = $state(false);
 let query = $state('');
 let editing = $state<ExecutionTask | null>(null);
 const planned = $derived(controller.todayTasks);
 const ready = $derived(planned.filter(task => task.status === 'ready'));
 const completed = $derived(planned.filter(task => task.status === 'done'));
 const current = $derived(controller.selectedTodayTask);
 const available = $derived(controller.availableTasks.filter(task => (task.title + ' ' + (task.context ?? '')).toLowerCase().includes(query.toLowerCase())));
 function meta(task: ExecutionTask) {
   return [task.context ?? (task.workstream !== 'general' ? task.workstream : ''),
     task.dueDate === controller.dayKey ? 'Due today' : task.dueDate,
     task.estimateMinutes ? controller.minutesLabel(task.estimateMinutes) : ''].filter(Boolean).join(' · ');
 }
</script>
<header class="mb-5 flex flex-wrap items-start justify-between gap-3">
 <div>
   <p class="text-meta text-muted-foreground">{new Date(controller.dayKey + 'T12:00:00').toLocaleDateString(undefined, {weekday:'long',month:'long',day:'numeric'})}</p>
   <h1 class="mt-1 text-page-title font-semibold">Today</h1>
   <p class="mt-1 text-meta text-muted-foreground">Only what you choose to do today.</p>
 </div>
 <Button size="sm" variant="ghost" class="hidden rounded-lg text-muted-foreground min-[760px]:inline-flex" onclick={() => showShelf = !showShelf}>
   {#if showShelf}<PanelRightClose class="mr-1 size-4"/> Hide list{:else}<PanelRightOpen class="mr-1 size-4"/> Browse list{/if}
 </Button>
</header>
<div class={showShelf ? 'grid gap-3 min-[760px]:grid-cols-[minmax(0,1fr)_272px]' : 'grid gap-3'}>
 <section class="min-w-0 rounded-[20px] border border-border bg-card p-4 sm:p-5">
   <div class="flex items-center justify-between gap-2">
     <h2 class="text-title font-medium">Your day</h2>
     <span class="text-meta text-muted-foreground">{completed.length} / {planned.length} completed</span>
   </div>
   <QuickCapture onAdd={title => controller.quickAdd(title, 'today')}/>
   <p class="mb-2 mt-6 text-meta font-semibold uppercase tracking-wider text-muted-foreground">Planned for today</p>
   <div class="divide-y divide-border border-t border-border">
     {#each ready as task (task.id)}
       <div class={current?.id === task.id ? 'flex min-h-14 items-center gap-2 rounded-lg bg-secondary/50 px-2 py-2' : 'flex min-h-14 items-center gap-2 py-2'}>
         <button type="button" class="flex size-7 shrink-0 items-center justify-center rounded-full" aria-label={'Complete ' + task.title} onclick={() => controller.completeQuick(task.id)}>
           <span class="size-[18px] rounded-full border border-muted-foreground/50"></span>
         </button>
         <button type="button" class="min-w-0 flex-1 py-1 text-left" onclick={() => editing = task}>
           <span class="block truncate text-ui font-medium">{task.title}</span>
           {#if meta(task)}<span class="block text-meta text-muted-foreground">{meta(task)}</span>{/if}
         </button>
         {#if current?.id === task.id}
           <span class="px-2 text-meta font-medium text-primary">Next</span>
         {:else}
           <Button size="sm" variant="ghost" class="h-8 rounded-lg px-2 text-meta text-muted-foreground" onclick={() => controller.chooseNext(task.id)}>Next</Button>
         {/if}
       </div>
     {:else}
       <p class="py-6 text-meta text-muted-foreground">Nothing planned. Add an activity or choose one from your list.</p>
     {/each}
     {#each planned.filter(task => task.status === 'blocked') as task (task.id)}
       <div class="flex min-h-12 items-center py-2">
         <button type="button" class="truncate text-ui text-muted-foreground" onclick={() => editing = task}>{task.title} · Blocked</button>
       </div>
     {/each}
   </div>
   <button type="button" class="mt-3 flex items-center gap-2 text-meta text-muted-foreground hover:text-foreground" aria-expanded={showDone} onclick={() => showDone = !showDone}>
     {#if showDone}<ChevronDown class="size-4"/>{:else}<ChevronRight class="size-4"/>{/if} Completed ({completed.length})
   </button>
   {#if showDone}
     <div class="mt-2 divide-y divide-border">
       {#each completed as task (task.id)}
         <div class="flex min-h-12 items-center gap-2 py-2">
           <button type="button" class="flex size-7 shrink-0 items-center justify-center text-primary" aria-label={'Reopen ' + task.title} onclick={() => controller.reopenQuick(task.id)}><Check class="size-4"/></button>
           <span class="min-w-0 flex-1 truncate text-ui text-muted-foreground line-through">{task.title}</span>
         </div>
       {/each}
     </div>
   {/if}
   <div class="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DCE7FF] bg-secondary/60 p-3">
     {#if current}
       <div class="min-w-0"><p class="text-meta font-medium text-primary">READY WHEN YOU ARE</p><p class="truncate text-ui font-medium">{current.title}</p></div>
       <Button class="rounded-lg" onclick={() => controller.openFocus(current)}><Play class="mr-1 size-4"/> Start focus</Button>
     {:else}
       <p class="text-meta text-muted-foreground">Your day is clear.</p>
       <Button size="sm" variant="outline" class="rounded-lg" onclick={() => { mobileShelf = true; showShelf = true; }}>Browse list</Button>
     {/if}
   </div>
   <button type="button" class="mt-4 flex items-center gap-2 text-meta text-muted-foreground min-[760px]:hidden" aria-expanded={mobileShelf} onclick={() => mobileShelf = !mobileShelf}>
     {#if mobileShelf}<ChevronDown class="size-4"/>{:else}<ChevronRight class="size-4"/>{/if} From your list ({controller.availableTasks.length})
   </button>
 </section>
 {#if showShelf || mobileShelf}
   <aside class={mobileShelf ? 'block' : 'hidden min-[760px]:block'}>
     <section class="rounded-[20px] border border-border bg-card p-4">
       <div class="flex items-start justify-between gap-2">
         <div><h2 class="text-title font-medium">From your list</h2><p class="mt-1 text-meta text-muted-foreground">Add existing activities</p></div>
         <span class="text-meta text-muted-foreground">{controller.availableTasks.length}</span>
       </div>
       <div class="relative mt-4">
         <Search class="absolute left-3 top-3 size-4 text-muted-foreground"/>
         <input bind:value={query} aria-label="Search available activities" placeholder="Search activities..."
           class="h-10 w-full rounded-lg border border-input bg-muted/25 pl-9 pr-3 text-ui outline-none focus:border-primary"/>
       </div>
       <div class="mt-2 divide-y divide-border">
         {#each available as task (task.id)}
           <div class="flex min-h-14 items-center gap-2 py-2">
             <div class="min-w-0 flex-1">
               <p class="truncate text-ui font-medium">{task.title}</p>
               {#if task.context}<p class="text-meta text-muted-foreground">{task.context}</p>{/if}
             </div>
             <Button variant="ghost" size="icon" class="size-8 rounded-lg" aria-label={'Add ' + task.title + ' to Today'} onclick={() => controller.addToToday(task.id)}><Plus class="size-4"/></Button>
           </div>
         {:else}
           <p class="py-5 text-meta text-muted-foreground">No activities to add.</p>
         {/each}
       </div>
     </section>
   </aside>
 {/if}
</div>
{#if editing}
 {#key editing.id}
   <TaskDetailDrawer task={editing} onClose={() => editing = null}
     onSave={fields => controller.editSimple(editing?.id ?? '', fields)}
     onArchive={() => { controller.archiveSimple(editing?.id ?? ''); editing = null; }}/>
 {/key}
{/if}