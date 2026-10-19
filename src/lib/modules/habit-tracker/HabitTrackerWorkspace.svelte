<script lang="ts">
  import ToolHeader from '#lib/components/ToolHeader.svelte';
  import HabitEditor from './components/HabitEditor.svelte';
  import CheckinEditor from './components/CheckinEditor.svelte';
  import HistoryView from './components/HistoryView.svelte';
  import InsightsView from './components/InsightsView.svelte';
  import TodayView from './components/TodayView.svelte';
  import { createHabitTrackerController } from './controller/habit-tracker.svelte.ts';

  const controller = createHabitTrackerController();
</script>

<section class="mx-auto min-h-[calc(100vh-76px)] w-full max-w-[1180px] px-4 pb-8 pt-8 max-[760px]:px-2.5 max-[760px]:pt-6">
  <div class="mx-auto w-full max-w-[860px]">
    <ToolHeader title="Habit Tracker"/>
    <nav aria-label="Habit Tracker views" class="mb-6 flex h-9 items-center gap-1 rounded-full bg-muted/65 p-1">
      <button type="button" aria-current={controller.view === 'today' ? 'page' : undefined}
        class={controller.view === 'today' ? 'h-7 flex-1 rounded-full bg-background px-3 text-meta font-medium' : 'h-7 flex-1 rounded-full px-3 text-meta text-muted-foreground'}
        onclick={() => controller.selectView('today')}>Today</button>
      <button type="button" aria-current={controller.view === 'history' ? 'page' : undefined}
        class={controller.view === 'history' ? 'h-7 flex-1 rounded-full bg-background px-3 text-meta font-medium' : 'h-7 flex-1 rounded-full px-3 text-meta text-muted-foreground'}
        onclick={() => controller.selectView('history')}>History</button>
      <button type="button" aria-current={controller.view === 'insights' ? 'page' : undefined}
        class={controller.view === 'insights' ? 'h-7 flex-1 rounded-full bg-background px-3 text-meta font-medium' : 'h-7 flex-1 rounded-full px-3 text-meta text-muted-foreground'}
        onclick={() => controller.selectView('insights')}>Insights</button>
    </nav>
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
    {:else if controller.view === 'history'}
      <HistoryView {controller}/>
    {:else if controller.view === 'insights'}
      <InsightsView {controller}/>
    {:else}
      <TodayView {controller}/>
    {/if}
  </div>

  {#if controller.correctionItem && controller.correction}
    <CheckinEditor item={controller.correctionItem} date={controller.correction.date}
      busy={controller.busy} error={controller.error}
      onSave={controller.submitCorrection} onCancel={controller.closeCorrection}/>
  {/if}

  {#if controller.editor}
    <HabitEditor
      mode={controller.editor.mode}
      title={controller.editor.title}
      today={controller.today}
      policy={controller.editor.policy}
      initialDirection={controller.editor.direction ?? 'BUILD'}
      busy={controller.busy}
      error={controller.error}
      onSave={controller.submitEditor}
      onCancel={controller.closeEditor}
    />
  {/if}
</section>
