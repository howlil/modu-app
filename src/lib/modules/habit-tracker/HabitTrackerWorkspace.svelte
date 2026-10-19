<script lang="ts">
  import ToolHeader from '#lib/components/ToolHeader.svelte';
  import HabitEditor from './components/HabitEditor.svelte';
  import TodayView from './components/TodayView.svelte';
  import { createHabitTrackerController } from './controller/habit-tracker.svelte.ts';

  const controller = createHabitTrackerController();
</script>

<section class="mx-auto min-h-[calc(100vh-76px)] w-full max-w-[1180px] px-4 pb-8 pt-8 max-[760px]:px-2.5 max-[760px]:pt-6">
  <div class="mx-auto w-full max-w-[860px]">
    <ToolHeader title="Habit Tracker"/>
    {#if controller.error}
      <div role="alert" class="mb-4 rounded-lg border border-destructive/30 bg-card p-4 text-ui text-destructive">
        {controller.error}
      </div>
    {/if}
    {#if controller.notice && controller.storageReady && !controller.error}
      <p role="status" class="mb-4 text-meta text-muted-foreground">{controller.notice}</p>
    {/if}
    {#if controller.loading}
      <p role="status" class="py-8 text-ui text-muted-foreground">Loading habits…</p>
    {:else if !controller.storageReady}
      <section class="rounded-[20px] border border-border bg-card p-5">
        <h2 class="text-title font-medium">Habit storage needs attention</h2>
        <p class="mt-2 text-ui text-muted-foreground">Existing data has not been overwritten. Check browser storage access and retry.</p>
        <button type="button" class="mt-4 rounded-full border border-border px-4 py-2 text-ui" onclick={controller.retry}>Retry loading</button>
      </section>
    {:else}
      <TodayView {controller}/>
    {/if}
  </div>

  {#if controller.editor}
    <HabitEditor
      mode={controller.editor.mode}
      title={controller.editor.title}
      busy={controller.busy}
      error={controller.error}
      onSave={controller.submitEditor}
      onCancel={controller.closeEditor}
    />
  {/if}
</section>
