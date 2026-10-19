<script lang="ts">
  import { onMount } from 'svelte';
  import ToolHeader from '#lib/components/ToolHeader.svelte';
  import PracticeView from './components/PracticeView.svelte';
  import { createLanguageLearningController } from './controller/language-learning.svelte.ts';
  const controller = createLanguageLearningController();
  let backupInput: HTMLInputElement;
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
