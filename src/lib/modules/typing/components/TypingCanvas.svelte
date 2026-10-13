<script lang="ts">
  import { RotateCcw } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { LESSONS, TRAINING_BLOCKS } from '../core/trainer.ts';
  import type { TypingController } from '../controller/typing.svelte.ts';
  import KeyboardGuide from './KeyboardGuide.svelte';

  let { controller, mode }: { controller: TypingController; mode: 'train' | 'test' } = $props();
  const text = $derived(controller.drillText);
  const cursor = $derived(controller.typedIndex);
  const isLesson = $derived(controller.selectedLessonIndex !== null && mode === 'train');
  const isDone = $derived(controller.runComplete);
  const guideLevel = $derived(controller.guideLevel);

  function textRuns(value: string) {
    const matches = value.matchAll(/\S+|\s+/g);
    return Array.from(matches, match => ({ text: match[0], start: match.index, whitespace: /^\s+$/.test(match[0]) }));
  }
  function characterClass(index: number) {
    if (index < cursor) return 'text-foreground';
    if (index === cursor) return controller.wrongAtCursor
      ? 'rounded-sm border-b-2 border-destructive bg-destructive/10 text-destructive'
      : 'rounded-sm border-b-2 border-primary bg-secondary text-secondary-foreground';
    return '';
  }
  function typed(event: Event) {
    const el = event.currentTarget as HTMLTextAreaElement;
    if (el.value) controller.typeText(el.value);
    el.value = '';
  }
  function restart() {
    if (mode === 'test') controller.startTest();
    else if (controller.selectedLessonIndex !== null) controller.startLesson(controller.selectedLessonIndex);
    else controller.startAdaptiveBlock();
  }
  function next() {
    if (mode === 'test') controller.startTest();
    else if (isLesson) controller.setPrimaryTab('lessons');
    else controller.nextBlock();
  }
</script>

<div class="mx-auto w-full max-w-[780px]">
  <header class="mb-6 text-center">
    <p class="font-mono text-meta tracking-[0.12em] text-primary">
      {mode === 'test' ? 'PERFORMANCE TEST' : isLesson ? 'GUIDED LESSON' : 'ADAPTIVE PRACTICE'}
    </p>
    <h2 class="mt-3 text-display font-semibold tracking-[-0.045em] max-[640px]:text-page-title">
      {mode === 'test' ? 'Measure your progress.' : isLesson ? 'Learn the movement.' : 'Find your rhythm.'}
    </h2>
    <p class="mt-2 text-ui text-muted-foreground">
      {mode === 'test' ? 'A fixed passage. Performance is separate from mastery.' : 'Accuracy first. Speed follows consistent movement.'}
    </p>
  </header>

  {#if mode === 'train' && !isLesson}
    <nav class="mx-auto mb-6 flex max-w-[400px] gap-2" aria-label="Training blocks">
      {#each TRAINING_BLOCKS as block, i}
        <button
          type="button"
          class={[
            'h-2 min-w-0 flex-1 rounded-full transition-colors',
            i === controller.blockIndex ? 'bg-primary' : i < controller.blockIndex ? 'bg-primary/35' : 'bg-border'
          ].join(' ')}
          title={block.name}
          aria-label={block.name}
          aria-current={i === controller.blockIndex ? 'step' : undefined}
          onclick={() => controller.selectBlock(i)}
        ></button>
      {/each}
    </nav>
  {/if}

  <div class="mb-3 flex items-center justify-between gap-3">
    <h3 class="min-w-0 truncate text-ui font-medium">
      {mode === 'test' ? 'Typing test' : isLesson ? LESSONS[controller.selectedLessonIndex ?? 0][0] : TRAINING_BLOCKS[controller.blockIndex].name}
    </h3>
    <span class="shrink-0 font-mono text-meta text-muted-foreground">
      {mode === 'test' ? 'TEST' : isLesson ? 'LESSON ' + ((controller.selectedLessonIndex ?? 0) + 1) + ' / 10' : (controller.blockIndex + 1) + ' / 5'}
    </span>
  </div>

  <div class="relative min-h-[210px] rounded-[20px] border border-border bg-card px-6 py-6 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 max-[640px]:min-h-[175px] max-[640px]:px-4"
    bind:this={controller.trainingSurface} tabindex="-1">
    <div class="min-h-[125px] font-mono text-[clamp(22px,3vw,32px)] leading-[1.75] tracking-[-0.035em] text-muted-foreground/60" aria-hidden="true">
      {#each textRuns(text) as run}
        {#if run.whitespace}
          {#each [...run.text] as ch, i}
            <span class={characterClass(run.start + i)}> </span><wbr />
          {/each}
        {:else}
          <span class="inline-block max-w-full break-all align-baseline">
            {#each [...run.text] as ch, i}
              <span class={characterClass(run.start + i)}>{ch}</span>
            {/each}
          </span>
        {/if}
      {/each}
    </div>
    <p class="mt-4 text-meta text-muted-foreground">
      {isDone ? 'Practice complete' : cursor > 0 ? Math.round((cursor / (text.length || 1)) * 100) + '% complete' : 'Click here and start typing'}
    </p>
    <textarea aria-label={'Type the practice text: ' + text}
      class="absolute inset-0 size-full resize-none cursor-text opacity-0"
      autocomplete="off" autocapitalize="off" spellcheck={false}
      oninput={typed}
      onpaste={(event) => event.preventDefault()}
      onkeydown={(event) => { if (event.key === 'Escape') event.currentTarget.blur(); }}
    ></textarea>
  </div>

  <div class="mt-6 flex justify-center gap-12 max-[460px]:gap-6">
    <div><span class="block text-meta text-muted-foreground">Accuracy</span><strong class="mt-1 block text-page-title font-semibold tabular-nums">{controller.accuracy}<span class="ml-1 text-meta font-normal text-muted-foreground">%</span></strong></div>
    <div><span class="block text-meta text-muted-foreground">Speed</span><strong class="mt-1 block text-page-title font-semibold tabular-nums">{controller.wpm}<span class="ml-1 text-meta font-normal text-muted-foreground">wpm</span></strong></div>
    <div><span class="block text-meta text-muted-foreground">Progress</span><strong class="mt-1 block text-page-title font-semibold tabular-nums">{Math.round(cursor / (text.length || 1) * 100)}<span class="ml-1 text-meta font-normal text-muted-foreground">%</span></strong></div>
  </div>

  {#if isDone}
    <div class="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-secondary/50 p-4" role="status">
      <div>
        <h3 class="text-ui font-semibold">Practice complete</h3>
        <p class="mt-1 text-meta text-muted-foreground">
          {controller.accuracy}% accuracy · {controller.wpm} wpm · {controller.errors} errors
        </p>
      </div>
      <Button size="sm" onclick={next}>{mode === 'test' ? 'Try again' : isLesson ? 'Back to lessons' : 'Next block'} →</Button>
    </div>
  {/if}

  <div class="mt-5 flex items-center justify-between gap-2">
    <div class="flex items-center gap-1">
      <Button variant="ghost" size="sm" class="rounded-full text-muted-foreground shadow-none" onclick={restart}>
        <RotateCcw class="size-3.5" /> Restart
      </Button>
      {#if mode === 'train' && isLesson}
        <Button variant="ghost" size="sm" class="rounded-full text-muted-foreground shadow-none" onclick={() => controller.setPrimaryTab('lessons')}>Lessons</Button>
      {/if}
      {#if guideLevel < 2}
        <Button variant="ghost" size="sm" class="rounded-full text-muted-foreground shadow-none" onclick={controller.cycleGuide}>
          {guideLevel === 0 ? 'Less guide' : 'Hide guide'}
        </Button>
      {:else}
        <Button variant="ghost" size="sm" class="rounded-full text-muted-foreground shadow-none" onclick={controller.cycleGuide}>Show guide</Button>
      {/if}
    </div>
    {#if !isDone && mode === 'train' && !isLesson}
      <Button variant="outline" size="sm" class="rounded-full shadow-none" onclick={next}>Next block →</Button>
    {/if}
  </div>

  {#if mode === 'train'}
    <KeyboardGuide character={controller.currentCharacter}
      typedIndex={cursor}
      {guideLevel}
      oppositeHandShift={controller.preferences.oppositeHandShift}
      fingerShadow={controller.preferences.fingerShadow} />
    <p class="mt-6 text-center text-meta text-muted-foreground">
      {isLesson ? 'Movement lesson' : '12-minute adaptive routine · ' + controller.minutesLeft + ' min after this block'}
    </p>
  {/if}
</div>
