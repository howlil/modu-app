<script lang="ts">
  import type { createLanguageLearningController } from '../controller/language-learning.svelte.ts';
  import { currentSentence } from '../core/learning.ts';
  let { controller }: { controller: ReturnType<typeof createLanguageLearningController> } = $props();
</script>

{#if controller.session}
  {@const session = controller.session}
  {@const item = currentSentence(session)}
  {#if session.status === 'completed' || session.status === 'abandoned'}
    <section class="rounded-xl border border-border bg-card p-6">
      <h2 class="text-title font-semibold">{session.status === 'completed' ? 'Practice complete' : 'Session ended'}</h2>
      <p class="mt-2 text-ui text-muted-foreground">
        {controller.summary.ratedRecalls} rated recalls · {controller.summary.exposures} exposures · {controller.summary.skips} skips
      </p>
      <p class="mt-3 text-meta text-muted-foreground">Preview results are not stored.</p>
      <button class="mt-5 rounded-full bg-primary px-5 py-2 text-ui font-medium text-primary-foreground" onclick={() => controller.start(session.mode)}>Restart demo</button>
    </section>
  {:else if session.status === 'paused'}
    <section class="rounded-xl border border-border bg-card p-6">
      <h2 class="text-title font-semibold">Paused</h2>
      <button class="mt-5 rounded-full bg-primary px-5 py-2 text-ui text-primary-foreground" onclick={controller.resume}>Resume</button>
    </section>
  {:else if item}
    <section class="rounded-xl border border-border bg-card p-6">
      <div class="flex items-center justify-between">
        <span class="text-meta text-muted-foreground">{session.cursor + 1} / {session.items.length}</span>
        <button class="rounded-full px-3 py-2 text-meta text-muted-foreground hover:bg-muted" onclick={controller.pause}>Pause</button>
      </div>
      <p class="mt-8 text-center text-title-lg font-medium">{session.mode === 'recall' ? item.prompt : item.answer}</p>
      {#if session.mode === 'recall'}
        {#if session.phase === 'prompt'}
          <div class="mt-8 flex justify-center">
            <button class="rounded-full bg-primary px-5 py-3 text-ui font-medium text-primary-foreground" onclick={controller.reveal}>Reveal answer</button>
          </div>
        {:else}
          <p class="mt-6 rounded-lg bg-secondary p-4 text-center text-body text-secondary-foreground">{item.answer}</p>
          <div class="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {#each ['again', 'hard', 'good', 'easy'] as rating}
              <button class="rounded-full border border-border px-3 py-3 text-ui capitalize hover:bg-muted" onclick={() => controller.rate(rating as 'again'|'hard'|'good'|'easy')}>{rating}</button>
            {/each}
          </div>
        {/if}
      {:else}
        <p class="mt-3 text-center text-ui text-muted-foreground">{item.prompt}</p>
        <p class="mt-2 text-center text-meta text-muted-foreground">Media playback is not part of this milestone.</p>
        <div class="mt-6 flex justify-center">
          <button class="rounded-full bg-primary px-5 py-3 text-ui text-primary-foreground" onclick={controller.nextExposure}>Continue</button>
        </div>
      {/if}
      <div class="mt-5 flex justify-between">
        <button class="rounded-full px-3 py-2 text-meta text-muted-foreground hover:bg-muted" onclick={controller.abandon}>End session</button>
        <button class="rounded-full px-3 py-2 text-meta text-muted-foreground hover:bg-muted" onclick={controller.skip}>Skip</button>
      </div>
    </section>
  {/if}
{/if}
{#if controller.error}
  <p role="alert" class="mt-3 text-ui text-destructive">{controller.error}</p>
{/if}
