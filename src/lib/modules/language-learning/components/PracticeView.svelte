<script lang="ts">
  import type { createLanguageLearningController } from '../controller/language-learning.svelte.ts';
  import { currentSentence } from '../core/learning.ts';
  import { recallFeedback } from '../core/evaluation.ts';
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
      {#if controller.lastRecallFeedback}
        <p class="mt-3 text-ui text-muted-foreground">{controller.lastRecallFeedback}</p>
      {/if}
      <p class="mt-3 text-meta text-muted-foreground">Practice results were saved in this browser.</p>
      {#if session.mode !== 'recall'}
        <button class="mt-5 rounded-full bg-primary px-5 py-2 text-ui font-medium text-primary-foreground" disabled={controller.pending || controller.canRetry} onclick={() => controller.start(session.mode)}>Restart practice</button>
      {/if}
    </section>
  {:else if session.status === 'paused'}
    <section class="rounded-xl border border-border bg-card p-6">
      <h2 class="text-title font-semibold">Paused</h2>
      <button class="mt-5 rounded-full bg-primary px-5 py-2 text-ui text-primary-foreground" disabled={controller.pending || controller.canRetry} onclick={controller.resume}>Resume</button>
    </section>
  {:else if item}
    <section class="rounded-xl border border-border bg-card p-6">
      <div class="flex items-center justify-between">
        <span class="text-meta text-muted-foreground">{session.cursor + 1} / {session.items.length}</span>
        <button class="rounded-full px-3 py-2 text-meta text-muted-foreground hover:bg-muted" disabled={controller.pending || controller.canRetry} onclick={controller.pause}>Pause</button>
      </div>
      <p class="mt-8 text-center text-title-lg font-medium">{session.mode === 'recall' ? item.prompt : item.answer}</p>
      {#if session.mode === 'recall'}
        {#if session.phase === 'prompt'}
          <div class="mt-6">
            <label for="language-recall-draft" class="block text-meta text-muted-foreground">Optional written response</label>
            <textarea id="language-recall-draft" rows="2" maxlength="2000"
              class="mt-2 w-full rounded-xl border border-border bg-background p-3 text-ui"
              placeholder="Type what you remember…"
              value={controller.answerDraft}
              disabled={controller.pending || controller.canRetry}
              oninput={(event) => controller.setAnswerDraft(event.currentTarget.value)}></textarea>
          </div>
          <div class="mt-8 flex justify-center">
            <button class="rounded-full bg-primary px-5 py-3 text-ui font-medium text-primary-foreground" disabled={controller.pending || controller.canRetry} onclick={controller.reveal}>Reveal answer</button>
          </div>
        {:else}
          <div class="mt-6 grid gap-3 sm:grid-cols-2">
            <div class="min-w-0 rounded-xl border border-border p-4">
              <p class="mb-2 text-meta text-muted-foreground">Your response</p>
              <p class="whitespace-pre-wrap break-words text-ui">{controller.answerDraft || 'No written response'}</p>
            </div>
            <div class="min-w-0 rounded-xl bg-secondary p-4">
              <p class="mb-2 text-meta text-muted-foreground">Reference answer</p>
              <p class="whitespace-pre-wrap break-words text-ui text-secondary-foreground">{item.answer}</p>
            </div>
          </div>
          {#if controller.answerCheck}
            <p role="status" class="mt-3 text-ui text-muted-foreground">{controller.answerCheck.feedback}</p>
          {/if}
          <p class="mt-4 text-meta text-muted-foreground">Rate your actual recall, not just whether the wording matches.</p>
          <div class="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {#each ['again', 'hard', 'good', 'easy'] as rating}
              <button class="rounded-full border border-border px-3 py-3 text-ui capitalize hover:bg-muted" title={recallFeedback(rating as 'again'|'hard'|'good'|'easy')}
                disabled={controller.pending || controller.canRetry} onclick={() => controller.rate(rating as 'again'|'hard'|'good'|'easy')}>{rating}</button>
            {/each}
          </div>
        {/if}
      {:else}
        <p class="mt-3 text-center text-ui text-muted-foreground">{item.prompt}</p>
        <p class="mt-3 text-center text-meta text-muted-foreground">
          {session.mode === 'listening'
            ? 'Listen to the reference, then confirm you listened.'
            : 'Listen first, repeat the sentence aloud, then confirm your practice.'}
        </p>
        {#if !controller.audioSupported}
          <p class="mt-4 text-center text-ui text-muted-foreground" role="status">
            Speech playback is not supported in this browser. You can skip this sentence.
          </p>
        {:else}
          <div class="mt-5 flex flex-wrap justify-center gap-2">
            <button class="rounded-full border border-border px-5 py-3 text-ui disabled:opacity-50"
              disabled={controller.pending || controller.canRetry || controller.audioStatus === 'playing'}
              onclick={controller.playAudio}>
              {controller.audioStatus === 'played' ? 'Replay audio' : 'Play audio'}
            </button>
            {#if controller.audioStatus === 'playing'}
              <button class="rounded-full border border-border px-5 py-3 text-ui"
                onclick={controller.stopAudio}>Stop playback</button>
            {/if}
          </div>
          {#if controller.audioStatus === 'playing'}
            <p class="mt-3 text-center text-meta text-muted-foreground" role="status">Playing reference audio…</p>
          {:else if controller.audioStatus === 'error'}
            <p class="mt-3 text-center text-ui text-destructive" role="alert">{controller.audioError}</p>
          {:else if controller.audioStatus === 'played'}
            <p class="mt-3 text-center text-meta text-muted-foreground" role="status">Reference playback completed.</p>
          {/if}
          {#if session.mode === 'shadowing' && controller.audioStatus === 'played'}
            <label class="mt-4 flex items-start justify-center gap-3 text-ui">
              <input type="checkbox" checked={controller.shadowConfirmed}
                disabled={controller.pending || controller.canRetry}
                onchange={(event)=>controller.confirmShadowing(event.currentTarget.checked)} />
              <span>I repeated this sentence aloud.</span>
            </label>
          {/if}
          <div class="mt-5 flex justify-center">
            <button class="rounded-full bg-primary px-5 py-3 text-ui text-primary-foreground disabled:opacity-50"
              disabled={controller.pending || controller.canRetry || !controller.canRecordExposure}
              onclick={controller.nextExposure}>
              {session.mode === 'listening' ? 'Mark listened' : 'Finish shadowing'}
            </button>
          </div>
        {/if}
      {/if}
      <div class="mt-5 flex justify-between">
        <button class="rounded-full px-3 py-2 text-meta text-muted-foreground hover:bg-muted" disabled={controller.pending || controller.canRetry} onclick={controller.abandon}>End session</button>
        <button class="rounded-full px-3 py-2 text-meta text-muted-foreground hover:bg-muted" disabled={controller.pending || controller.canRetry} onclick={controller.skip}>Skip</button>
      </div>
    </section>
  {/if}
{/if}
{#if controller.pending}
  <p role="status" class="mt-3 text-ui text-muted-foreground">Saving practice…</p>
{/if}
{#if controller.error}
  <div class="mt-3" role="alert">
    <p class="text-ui text-destructive">{controller.error}</p>
    <div class="mt-3 flex gap-2">
      {#if controller.canRetry}
        <button class="rounded-full border border-border px-4 py-2 text-ui" disabled={controller.pending} onclick={controller.retry}>Retry the same action</button>
      {/if}
      <button class="rounded-full border border-border px-4 py-2 text-ui" disabled={controller.pending} onclick={controller.load}>Reload saved session</button>
    </div>
  </div>
{/if}
