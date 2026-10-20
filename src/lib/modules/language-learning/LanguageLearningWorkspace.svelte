<script lang="ts">
  import { onMount } from 'svelte';
  import ToolHeader from '#lib/components/ToolHeader.svelte';
  import PracticeView from './components/PracticeView.svelte';
  import ContentEditor from './components/ContentEditor.svelte';
  import { createLanguageLearningController } from './controller/language-learning.svelte.ts';
  const controller = createLanguageLearningController();
  let backupInput: HTMLInputElement;
  let catalogInput: HTMLInputElement;
  let newLanguage=$state('');
  onMount(() => { void controller.load(); });
  async function downloadBackup() {
    const content = await controller.exportBackup();
    if (!content) return;
    const blob = new Blob([content], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modu-learning-backup-' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  async function downloadCatalog() {
    const content=await controller.exportCatalog();
    if(!content)return;
    const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
    const link=document.createElement('a');
    link.href=url;
    link.download='modu-language-catalog-'+controller.profile.targetLanguage+'.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),10_000);
  }
  async function selectCatalog(event:Event) {
    const input=event.currentTarget as HTMLInputElement;
    const file=input.files?.[0];
    if(!file)return;
    try {
      if(file.size>2*1024*1024){window.alert('Catalog exceeds the 2 MiB import limit.');return;}
      await controller.importCatalog(await file.text());
    } catch {window.alert('Unable to read catalog file.');}
    finally {input.value='';}
  }
  function addLanguage(event:SubmitEvent) {
    event.preventDefault();
    if(!newLanguage.trim())return;
    void controller.createProfile(newLanguage);
    newLanguage='';
  }
  async function selectBackup(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (!window.confirm('Replace all language learning history in this browser with this backup?')) return;
      if (file.size > 256 * 1024 * 1024) {
        window.alert('This backup exceeds the 256 MiB restore limit.');
        return;
      }
      try {
        await controller.importBackup(await file.text());
      } catch {
        window.alert('Unable to read this backup file.');
      }
    } finally { input.value = ''; }
  }
</script>

<section class="mx-auto w-full max-w-[1180px] px-4 py-8 max-[760px]:px-2.5">
  <div class="mx-auto w-full max-w-[860px]">
    <ToolHeader title="Language Learning" />
    <p class="mb-6 text-ui text-muted-foreground">
      Explore sentence recall with a short practice session.
    </p>
    {#if controller.loading}
      <p class="text-ui text-muted-foreground" role="status">Loading learning history…</p>
    {:else if !controller.ready}
      <div class="rounded-xl border border-border bg-card p-6">
        <p class="text-ui text-destructive" role="alert">{controller.error}</p>
        <button class="mt-4 rounded-full bg-primary px-5 py-2 text-ui text-primary-foreground" onclick={controller.load}>Retry connection</button>
      </div>
    {:else if !controller.session || controller.session.status === 'completed' || controller.session.status === 'abandoned'}
      <section class="mb-6 rounded-xl border border-border bg-card p-4" aria-label="Language content">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-title font-semibold">Language library</h2>
          <div class="flex flex-wrap gap-2">
            <button type="button" disabled={controller.pending}
              class="rounded-full border border-border px-4 py-2 text-ui"
              onclick={downloadCatalog}>Export catalog</button>
            <button type="button" disabled={controller.pending}
              class="rounded-full border border-border px-4 py-2 text-ui"
              onclick={()=>catalogInput?.click()}>Import catalog</button>
            <input type="file" bind:this={catalogInput} accept=".json,application/json"
              aria-label="Choose Language Island catalog" class="sr-only" onchange={selectCatalog}/>
          </div>
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <label class="text-meta text-muted-foreground">Current language
            <select class="ml-2 rounded-full border border-border bg-background px-3 py-2 text-ui"
              disabled={controller.pending}
              value={controller.profile.id}
              onchange={(event)=>controller.selectProfile(event.currentTarget.value)}>
              {#each controller.profiles as profile (profile.id)}
                <option value={profile.id}>{profile.targetLanguage}</option>
              {/each}
            </select>
          </label>
          <form class="flex gap-2" onsubmit={addLanguage}>
            <input bind:value={newLanguage} required maxlength="32" placeholder="Language code (e.g. ja)"
              disabled={controller.pending}
              aria-label="New target language code"
              class="w-40 rounded-full border border-border bg-background px-3 py-2 text-ui"/>
            <button type="submit" disabled={controller.pending}
              class="rounded-full border border-border px-4 py-2 text-ui">Add language</button>
          </form>
        </div>
        <div class="mt-4 space-y-2">
          {#each controller.catalogs as content (content.island.id)}
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div>
                <p class="text-ui font-medium">{content.island.title}{content.archived ? ' · Archived' : ''}</p>
                <p class="text-meta text-muted-foreground">
                  {content.island.sentences.length} sentences · {content.vocabulary.length} vocabulary entries · revision {content.island.revision}
                </p>
              </div>
              <div class="flex gap-2">
                <button type="button" disabled={controller.pending}
                  class="rounded-full border border-border px-3 py-2 text-meta"
                  onclick={()=>controller.editIsland(content.island.id)}>Edit</button>
                <button type="button" disabled={controller.pending}
                  class="rounded-full border border-border px-3 py-2 text-meta"
                  onclick={()=>controller.archiveContent(content,!content.archived)}>
                  {content.archived ? 'Restore' : 'Archive'}
                </button>
              </div>
            </div>
          {/each}
          {#if controller.catalogs.length===0}
            <p class="text-ui text-muted-foreground">No Islands yet. Add one to begin learning.</p>
          {/if}
        </div>
        <button type="button" disabled={controller.pending}
          class="mt-4 rounded-full border border-border px-4 py-2 text-ui"
          onclick={controller.beginNewIsland}>New Island</button>
        {#if controller.editing !== undefined}
          <div class="mt-4">
            {#key controller.editing?.island.id ?? 'new'}
              <ContentEditor profile={controller.profile} content={controller.editing}
                busy={controller.pending} onSave={(draft)=>controller.saveIsland(draft)}
                onCancel={controller.cancelEditor}/>
            {/key}
          </div>
        {/if}
      </section>
      {#if controller.plan}
        <section class="rounded-xl border border-border bg-card p-4" aria-label="Recommended practice">
          <h2 class="text-title font-semibold">Recommended practice</h2>
          <p class="mt-2 text-ui text-muted-foreground">
            {controller.plan.dueCount} due reviews · {controller.plan.newCount} not yet recalled
          </p>
          {#if controller.plan.tasks.length}
            <button type="button" class="mt-4 rounded-full bg-primary px-5 py-3 text-ui font-medium text-primary-foreground disabled:opacity-50"
              disabled={controller.pending || controller.canRetry} onclick={controller.startRecommended}>Start recommended recall</button>
          {:else}
            <p class="mt-3 text-ui text-muted-foreground" role="status">All caught up with current material.</p>
            <button type="button" class="mt-3 rounded-full border border-border px-4 py-2 text-ui"
              disabled={controller.pending} onclick={controller.refreshPlan}>Refresh recommendations</button>
          {/if}
        </section>
      {/if}
      {#if controller.planError}
        <p class="mt-3 text-ui text-destructive" role="alert">{controller.planError}</p>
        <button type="button" class="mt-2 rounded-full border border-border px-4 py-2 text-ui"
          disabled={controller.pending} onclick={controller.refreshPlan}>Retry recommendations</button>
      {/if}
    {/if}
    <div class="mt-6">
      <PracticeView {controller} />
    </div>
    {#if controller.ready}
      <section class="mt-8 border-t border-border pt-4" aria-label="Learning data">
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="rounded-full border border-border px-4 py-2 text-ui disabled:opacity-50"
            disabled={controller.pending} onclick={downloadBackup}>Export backup</button>
          <button type="button" class="rounded-full border border-border px-4 py-2 text-ui disabled:opacity-50"
            disabled={controller.pending} onclick={() => backupInput?.click()}>Restore backup</button>
          <input bind:this={backupInput} type="file" accept=".json,application/json" class="sr-only"
            aria-label="Choose language learning backup" onchange={selectBackup} />
          {#if controller.persistenceStatus === 'not-granted'}
            <button type="button" class="rounded-full px-4 py-2 text-ui text-muted-foreground hover:bg-muted"
              disabled={controller.pending} onclick={controller.requestStoragePersistence}>Protect browser storage</button>
          {:else if controller.persistenceStatus === 'granted'}
            <span class="text-meta text-muted-foreground">Browser storage protected</span>
          {/if}
        </div>
        <p class="mt-2 text-meta text-muted-foreground">Progress stays in this browser. Export a backup before clearing site data or switching devices.</p>
      </section>
      {#if controller.error && !controller.session}
        <p role="alert" class="mt-3 text-ui text-destructive">{controller.error}</p>
      {/if}
    {/if}
  </div>
</section>
