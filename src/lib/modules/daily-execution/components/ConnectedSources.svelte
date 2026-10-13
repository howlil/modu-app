<script lang="ts">
 import { Link2, Github, FileJson, RefreshCw, Search, Plus, ExternalLink, Pause, Play, Unplug } from 'lucide-svelte';
 import { onMount } from 'svelte';
 import { Button } from '#lib/components/ui/button/index.js';
 import type { DailyExecutionController } from '../controller/daily-execution.svelte.ts';

 let { controller }: { controller: DailyExecutionController } = $props();
 onMount(() => {
   if(new URLSearchParams(window.location.search).get('google')!=='connected')
     void controller.loadGoogleStatus();
 });
 let repository = $state('');
 let manualTitle = $state('');
 let manualUrl = $state('');
 let importing = $state(false);
 let fileInput: HTMLInputElement | undefined = $state(undefined);
 let search = $state('');
 let limit = $state(12);
 const matching = $derived(controller.availableSources.filter(item=>
   (item.title+' '+item.source.connectionId).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
 ).slice(0,limit));
 const total = $derived(controller.availableSources.filter(item=>
   (item.title+' '+item.source.connectionId).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
 ).length);
 async function importFile(event: Event) {
   const file=(event.currentTarget as HTMLInputElement).files?.[0];
   if(!file)return;
   importing=true;
   try{await controller.importActivities(file);}
   finally{importing=false;if(fileInput)fileInput.value='';}
 }
 function addRepository() {
   if(controller.connectGithub(repository))repository='';
 }
 function addLink() {
   if(controller.addManualLink(manualTitle,manualUrl,true)){manualTitle='';manualUrl='';}
 }
</script>

<section class="mt-4 rounded-[20px] border border-border bg-card p-4 sm:p-5" aria-label="Connected activity sources">
 <header class="mb-4">
   <h2 class="text-title font-medium">Activity sources</h2>
   <p class="mt-1 text-meta text-muted-foreground">Optional, read-only references. Completing an activity here never updates its original.</p>
 </header>

 <div class="grid gap-3 sm:grid-cols-2">
   <form class="rounded-xl border border-border p-3" onsubmit={(e)=>{e.preventDefault();addRepository();}}>
     <div class="flex items-center gap-2 text-ui font-medium"><Github class="size-4"/> Public GitHub Issues</div>
     <p class="mt-1 text-meta text-muted-foreground">Public repositories only. No account access or token.</p>
     <label class="mt-3 block text-meta text-muted-foreground" for="daily-github-repo">Repository</label>
     <input id="daily-github-repo" class="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-ui" placeholder="owner/repo" maxlength="145" bind:value={repository}/>
     <Button type="submit" size="sm" variant="outline" class="mt-2 min-h-10 rounded-lg" disabled={!repository.trim()}>Add repository</Button>
   </form>
   <div class="rounded-xl border border-border p-3">
     <div class="flex items-center gap-2 text-ui font-medium"><FileJson class="size-4"/> Import activities</div>
     <p class="mt-1 text-meta text-muted-foreground">Local JSON file, up to 250 activities and 256 KB. Nothing is uploaded.</p>
     <label for="daily-activities-file" class="mt-3 block text-meta text-muted-foreground">Choose a JSON array</label>
     <input id="daily-activities-file" bind:this={fileInput} type="file" accept=".json,application/json"
       class="mt-1 block w-full min-w-0 rounded-lg border border-input p-2 text-meta" disabled={importing} onchange={importFile}/>
     {#if importing}<p role="status" class="mt-2 text-meta text-muted-foreground">Importing activities…</p>{/if}
   </div>
 </div>

 <section class="mt-3 rounded-xl border border-border p-3" aria-label="Google Tasks account">
   <div class="flex flex-wrap items-start justify-between gap-2">
     <div>
       <h3 class="text-ui font-medium">Google Tasks</h3>
       <p class="mt-1 max-w-[520px] text-meta text-muted-foreground">Optional read-only account connection. Modu never completes or edits tasks in Google.</p>
     </div>
     {#if !controller.googleChecked}
       <span class="text-meta text-muted-foreground">Checking availability…</span>
     {:else if !controller.googleStatus.available}
       <span class="text-meta text-muted-foreground">Not configured</span>
     {:else if controller.googleStatus.connected}
       <span class="text-meta text-muted-foreground">Connected in this browser</span>
     {:else}
       <span class="text-meta text-muted-foreground">Disconnected</span>
     {/if}
   </div>
   {#if controller.googleStatus.available}
     <div class="mt-3 flex flex-wrap gap-2">
       {#if controller.googleStatus.connected}
         <Button size="sm" variant="outline" class="min-h-10 rounded-lg" disabled={controller.googleBusy || controller.sourceSyncing!==null}
           onclick={() => controller.refreshGoogle()}>
           <RefreshCw class="mr-1 size-4"/>{controller.googleBusy?'Loading…':'Refresh Google Tasks'}
         </Button>
         <Button size="sm" variant="ghost" class="min-h-10 rounded-lg text-muted-foreground" disabled={controller.googleBusy}
           onclick={() => controller.disconnectGoogle()}>Disconnect Google</Button>
       {:else}
         <Button size="sm" variant="outline" class="min-h-10 rounded-lg" disabled={controller.googleBusy}
           onclick={() => controller.connectGoogle()}>{controller.googleBusy?'Connecting…':'Connect Google Tasks'}</Button>
       {/if}
     </div>
   {:else if controller.googleChecked}
     <p class="mt-2 text-meta text-muted-foreground">Requires the secure Google OAuth and Cloudflare D1 setup. Public GitHub Issues and local activities work without it.</p>
   {/if}
 </section>

 <form class="mt-3 rounded-xl border border-border p-3" onsubmit={(e)=>{e.preventDefault();addLink();}}>
   <div class="flex items-center gap-2 text-ui font-medium"><Link2 class="size-4"/> Add by link</div>
   <p class="mt-1 text-meta text-muted-foreground">One title and one HTTPS link. Adds directly to Today.</p>
   <div class="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
     <label class="grid gap-1 text-meta text-muted-foreground">Title
       <input class="h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-ui" bind:value={manualTitle} maxlength="120" placeholder="Review project brief"/>
     </label>
     <label class="grid gap-1 text-meta text-muted-foreground">Original HTTPS URL
       <input class="h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-ui" type="url" bind:value={manualUrl} placeholder="https://..." required/>
     </label>
     <Button type="submit" size="sm" class="min-h-10 rounded-lg" disabled={!manualTitle.trim()||!manualUrl.trim()}>Add to Today</Button>
   </div>
 </form>

 {#if controller.sourceError}
   <p role="alert" class="mt-3 rounded-lg border border-destructive/30 p-3 text-meta text-destructive">{controller.sourceError}</p>
 {:else if controller.sourceNotice}
   <p role="status" class="mt-3 text-meta text-muted-foreground">{controller.sourceNotice}</p>
 {/if}

 {#if controller.state.sourceConnections.length}
   <div class="mt-5 border-t border-border pt-4">
     <h3 class="text-ui font-medium">Your sources</h3>
     <div class="mt-2 divide-y divide-border">
       {#each controller.state.sourceConnections as connection (connection.id)}
         <div class="flex min-w-0 flex-wrap items-center gap-2 py-3">
           <div class="min-w-0 flex-1">
             <p class="truncate text-ui font-medium">{connection.label}</p>
             <p class="text-meta text-muted-foreground">{connection.providerId==='github'?'GitHub Issues':connection.providerId==='import'?'Local JSON':connection.providerId==='google-tasks'?'Google Tasks':'Manual links'} · {connection.status==='up-to-date'?'Up to date':connection.status}
               {#if connection.lastSyncedAt} · {new Date(connection.lastSyncedAt).toLocaleString()}{/if}
             </p>
           </div>
           {#if connection.providerId==='github'}
             <Button size="sm" variant="ghost" class="min-h-10 rounded-lg text-meta" disabled={controller.sourceSyncing!==null||connection.status==='paused'}
               onclick={() => controller.refreshConnection(connection.id)} aria-label={'Refresh '+connection.label}>
               <RefreshCw class="mr-1 size-4"/> {controller.sourceSyncing===connection.id?'Loading…':'Refresh'}
             </Button>
             <Button size="icon" variant="ghost" class="size-10 rounded-lg" aria-label={(connection.status==='paused'?'Resume ':'Pause ')+connection.label}
               onclick={() => controller.pauseConnection(connection.id)}>
               {#if connection.status==='paused'}<Play class="size-4"/>{:else}<Pause class="size-4"/>{/if}
             </Button>
           {/if}
           {#if connection.providerId!=='google-tasks'}
             <Button size="icon" variant="ghost" class="size-10 rounded-lg" aria-label={'Disconnect '+connection.label}
               onclick={() => controller.removeConnection(connection.id)}><Unplug class="size-4"/></Button>
           {/if}
         </div>
       {/each}
     </div>
   </div>
 {/if}

 {#if controller.availableSources.length}
   <div class="mt-5 border-t border-border pt-4">
     <div class="flex flex-wrap items-center justify-between gap-2">
       <h3 class="text-ui font-medium">Available from sources</h3>
       <span class="text-meta text-muted-foreground">{total} activities</span>
     </div>
     <div class="relative mt-3">
       <Search class="absolute left-3 top-3 size-4 text-muted-foreground"/>
       <input aria-label="Search connected activities" bind:value={search} oninput={() => limit=12}
         class="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-ui" placeholder="Find an activity..."/>
     </div>
     <div class="mt-2 divide-y divide-border">
       {#each matching as item (item.source.providerId+item.source.connectionId+item.source.externalId)}
         <div class="flex min-w-0 items-center gap-2 py-2">
           <div class="min-w-0 flex-1">
             <p class="truncate text-ui font-medium">{item.title}</p>
             <p class="truncate text-meta text-muted-foreground">{item.source.connectionId} · {item.source.remoteStatus}</p>
           </div>
           {#if item.source.url}
             <a href={item.source.url} target="_blank" rel="noopener noreferrer" class="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label={'Open original '+item.title}><ExternalLink class="size-4"/></a>
           {/if}
           <Button size="icon" variant="ghost" class="size-10 rounded-lg" aria-label={'Add linked '+item.title+' to Today'} onclick={() => controller.linkCandidate(item,true)}><Plus class="size-4"/></Button>
         </div>
       {/each}
     </div>
     {#if matching.length<total}
       <Button variant="ghost" size="sm" class="mt-3 min-h-10 rounded-lg" onclick={() => limit+=12}>Show more</Button>
     {/if}
   </div>
 {/if}
</section>
