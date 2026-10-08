<script lang="ts">
  import {
    dueKeys,
    weakKeys,
    weakTransitions,
    type TypingLearningState,
    type TypingPreferences
  } from '../trainer.ts';

  let { learningState, preferences }: {
    learningState: TypingLearningState;
    preferences: TypingPreferences;
  } = $props();

  const weakKeyMetrics = $derived(weakKeys(learningState, preferences, 4));
  const weakTransitionMetrics = $derived(weakTransitions(learningState, 4));
  const dueReviewKeys = $derived(dueKeys(learningState).slice(0, 8));
  const recentTrainingSessions = $derived(
    learningState.sessions.filter((session) => session.kind !== 'test').slice(-7)
  );

  function trendHeight(wpmValue: number) {
    const values = recentTrainingSessions.map((session) => session.wpm);
    const max = Math.max(20, ...values);
    return `${Math.max(16, Math.round((wpmValue / max) * 100))}%`;
  }

  function formatKey(key: string) {
    return key === ' ' ? 'SPACE' : key.toUpperCase();
  }
</script>

<div>
  <h2 class="m-0 text-title font-semibold tracking-[-0.03em]">Progress</h2>
  <p class="mt-1 text-meta text-muted-foreground">What changed, and what still needs work.</p>
</div>

<section class="mt-8 border-b border-border pb-6">
  <div class="flex items-end justify-between gap-4">
    <div>
      <span class="text-meta text-muted-foreground">Recent speed</span>
      <div class="mt-1 text-page-title font-semibold tracking-[-0.04em]">
        {recentTrainingSessions[recentTrainingSessions.length - 1]?.wpm ?? 0}
        <span class="text-meta font-normal tracking-normal text-muted-foreground">wpm</span>
      </div>
    </div>
    <span class="text-meta text-muted-foreground">{recentTrainingSessions.length} sessions</span>
  </div>

  {#if recentTrainingSessions.length > 0}
    <div class="mt-6 flex h-[96px] items-end gap-2">
      {#each recentTrainingSessions as session}
        <div
          class="relative min-w-1 flex-1 border-t border-primary bg-secondary/45"
          style:height={trendHeight(session.wpm)}
          title={`${session.wpm} WPM · ${session.accuracy}%`}
        ></div>
      {/each}
    </div>
  {:else}
    <p class="mt-5 text-meta text-muted-foreground">Finish a training block to start the trend.</p>
  {/if}
</section>

<div class="grid grid-cols-2 gap-8 py-6 max-[680px]:grid-cols-1 max-[680px]:gap-6">
  <section class="min-w-0">
    <h3 class="m-0 text-meta font-medium">Needs work</h3>
    <div class="mt-3 divide-y divide-border">
      {#if weakKeyMetrics.length > 0}
        {#each weakKeyMetrics as metric}
          <div class="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 py-3 text-meta">
            <strong class="font-mono font-medium">{formatKey(metric.key)}</strong>
            <div class="h-px min-w-0 bg-border">
              <div
                class="h-px bg-primary"
                style:width={`${Math.max(8, Math.round((1 - metric.weakness) * 100))}%`}
              ></div>
            </div>
            <span class="text-muted-foreground">
              {metric.accuracy === null ? '—' : `${Math.round(metric.accuracy)}%`}
            </span>
          </div>
        {/each}
      {:else}
        <p class="py-3 text-meta text-muted-foreground">More samples needed.</p>
      {/if}

      {#each weakTransitionMetrics.slice(0, 2) as metric}
        <div class="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 py-3 text-meta">
          <strong class="font-mono font-medium">{metric.pair.toUpperCase()}</strong>
          <div class="h-px min-w-0 bg-border">
            <div
              class="h-px bg-primary"
              style:width={`${Math.max(8, Math.round((1 - metric.weakness) * 100))}%`}
            ></div>
          </div>
          <span class="text-muted-foreground">
            {metric.latency === null ? 'slow' : `${Math.round(metric.latency)}ms`}
          </span>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h3 class="m-0 text-meta font-medium">Review today</h3>
    <div class="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-mono text-meta">
      {#if dueReviewKeys.length > 0}
        {#each dueReviewKeys as key}
          <span>{formatKey(key)}</span>
        {/each}
      {:else}
        <span class="font-sans text-meta text-muted-foreground">Nothing due.</span>
      {/if}
    </div>
  </section>
</div>

