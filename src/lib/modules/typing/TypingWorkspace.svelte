<script lang="ts">
  import { RotateCcw, Settings2 } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
  import ToolHeader from '#lib/components/ToolHeader.svelte';
  import ProgressView from './components/ProgressView.svelte';
  import SettingsView from './components/SettingsView.svelte';
  import { KEY_ROWS, LESSONS, TRAINING_BLOCKS, fingerFor, keyMetric } from './core/trainer.ts';
  import { createTypingController } from './controller/typing.svelte.ts';

  const controller = createTypingController();
  const selectedLessonIndex = $derived(controller.selectedLessonIndex);
  const learningState = $derived(controller.learningState);
  const preferences = $derived(controller.preferences);
  const audioUnavailable = $derived(controller.audioUnavailable);
  const blockIndex = $derived(controller.blockIndex);
  const drillText = $derived(controller.drillText);
  const typedIndex = $derived(controller.typedIndex);
  const wrongAtCursor = $derived(controller.wrongAtCursor);
  const runComplete = $derived(controller.runComplete);
  const currentBlock = $derived(controller.currentBlock);
  const currentCharacter = $derived(controller.currentCharacter);
  const accuracy = $derived(controller.accuracy);
  const wpm = $derived(controller.wpm);
  const guideLevel = $derived(controller.guideLevel);
  const target = $derived(controller.target);
  const minutesLeft = $derived(controller.minutesLeft);

  const {
    startAdaptiveBlock, startTest, startLesson, nextBlock, setPrimaryTab,
    cycleGuide, previewKeyboardSound, togglePreference
  } = controller;

  function shortFinger(character: string) {
    return fingerFor(character)
      .replace('Left ', 'L ')
      .replace('Right ', 'R ');
  }

  function keyStateClass(key: string) {
    if (key === ' ') return '';

    const metric = keyMetric(learningState, key, preferences);
    if (metric.mastered) return 'border-success/35 text-success';
    if (metric.status === 'weak') return 'border-destructive/35 text-destructive';

    return '';
  }

  function textRuns(text: string) {
    const runs: Array<{ text: string; start: number; whitespace: boolean }> = [];
    const matcher = /\S+|\s+/g;
    let match: RegExpExecArray | null;

    while ((match = matcher.exec(text)) !== null) {
      runs.push({
        text: match[0],
        start: match.index,
        whitespace: /^\s+$/.test(match[0])
      });
    }

    return runs;
  }

  function characterClass(characterIndex: number) {
    const isCurrent = characterIndex === typedIndex;

    return [
      characterIndex < typedIndex ? 'text-foreground' : '',
      isCurrent && !wrongAtCursor
        ? 'rounded-sm border-b-2 border-primary bg-secondary text-secondary-foreground'
        : '',
      isCurrent && wrongAtCursor
        ? 'rounded-sm border-b-2 border-destructive bg-destructive/10 text-destructive'
        : ''
    ]
      .filter(Boolean)
      .join(' ');
  }

  function formatKey(key: string) {
    return key === ' ' ? 'SPACE' : key.toUpperCase();
  }
</script>

<section class="mx-auto w-full max-w-[1180px] px-4 py-8 max-[760px]:px-2.5 max-[760px]:py-6">
  <div class="mx-auto w-full max-w-[860px] min-w-0">
    <ToolHeader title="Typing Practice" />

    <Tabs.Root bind:value={controller.primaryTab} class="gap-0">
      <Tabs.List
        variant="default"
        class="-mt-2 h-9 w-full min-w-0 justify-start rounded-full bg-muted/65 p-1"
      >
        <Tabs.Trigger
          value="train"
          class="h-7 flex-none rounded-full px-3 py-0 text-meta font-normal data-[state=active]:font-medium data-[state=active]:shadow-none"
          onclick={() => setPrimaryTab('train')}
        >
          Train
        </Tabs.Trigger>
        <Tabs.Trigger
          value="lessons"
          class="h-7 flex-none rounded-full px-3 py-0 text-meta font-normal data-[state=active]:font-medium data-[state=active]:shadow-none"
          onclick={() => setPrimaryTab('lessons')}
        >
          Lessons
        </Tabs.Trigger>
        <Tabs.Trigger
          value="test"
          class="h-7 flex-none rounded-full px-3 py-0 text-meta font-normal data-[state=active]:font-medium data-[state=active]:shadow-none"
          onclick={() => setPrimaryTab('test')}
        >
          Test
        </Tabs.Trigger>
        <Tabs.Trigger
          value="progress"
          class="h-7 flex-none rounded-full px-3 py-0 text-meta font-normal data-[state=active]:font-medium data-[state=active]:shadow-none"
          onclick={() => setPrimaryTab('progress')}
        >
          Progress
        </Tabs.Trigger>
        <Tabs.Trigger
          value="settings"
          class="ml-auto size-7 flex-none rounded-full p-0 after:hidden data-[state=active]:bg-background data-[state=active]:shadow-none"
          aria-label="Typing settings"
          onclick={() => setPrimaryTab('settings')}
        >
          <Settings2 class="size-4" strokeWidth={1.8} />
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="train" class="min-w-0 pt-6 max-[640px]:pt-6">
        <div class="flex min-w-0 items-start justify-between gap-5">
          <div class="min-w-0">
            <h2 class="m-0 truncate text-ui font-medium tracking-[-0.015em]">
              {selectedLessonIndex === null ? currentBlock.name : LESSONS[selectedLessonIndex][0]}
            </h2>
            <p class="mt-1 truncate font-mono text-meta text-muted-foreground">
              {target}
            </p>
          </div>

          <span class="shrink-0 text-meta tabular-nums text-muted-foreground">
            {#if selectedLessonIndex !== null}
              Lesson {selectedLessonIndex + 1} / {LESSONS.length}
            {:else}
              {blockIndex + 1} / {TRAINING_BLOCKS.length}
              {#if minutesLeft > 0}
                <span class="ml-2">~{minutesLeft}m</span>
              {/if}
            {/if}
          </span>
        </div>

        <div
          class="mt-8 min-h-[168px] w-full min-w-0 max-w-full overflow-x-clip outline-none ring-ring focus-visible:ring-2 max-[640px]:mt-6 max-[640px]:min-h-[150px]"
          bind:this={controller.trainingSurface}
          role="textbox"
          aria-label="Typing practice"
          aria-multiline="true"
          tabindex="0"
        >
          <div class="block w-full min-w-0 max-w-full overflow-x-clip font-mono text-[clamp(20px,2.8vw,27px)] leading-[1.72] tracking-[-0.02em] text-muted-foreground/70">
            {#each textRuns(drillText) as run}
              {#if run.whitespace}
                {#each [...run.text] as character, localIndex}
                  <span class={characterClass(run.start + localIndex)}> </span><wbr />
                {/each}
              {:else}
                <span class="inline-block max-w-full break-all align-baseline">
                  {#each [...run.text] as character, localIndex}
                    <span class={characterClass(run.start + localIndex)}>{character}</span>
                  {/each}
                </span>
              {/if}
            {/each}
          </div>
        </div>

        <div class="flex min-w-0 items-center justify-between gap-4 border-b border-border pb-4 text-meta max-[560px]:items-start max-[560px]:flex-col max-[560px]:gap-3">
          <div class="min-w-0 text-muted-foreground">
            {#if runComplete}
              <strong class="font-medium text-foreground">Complete</strong>
            {:else if currentCharacter}
              <strong class="font-medium text-foreground">{fingerFor(currentCharacter)}</strong>
              <span class="mx-2">·</span>
              <span>{currentCharacter === ' ' ? 'Space' : currentCharacter}</span>
            {:else}
              <span>Start typing</span>
            {/if}
          </div>

          <div class="flex shrink-0 items-center gap-4 tabular-nums text-muted-foreground">
            <span>{accuracy}% acc</span>
            <span>{wpm} wpm</span>
          </div>
        </div>

        {#if guideLevel < 2}
          <div class="mt-6 max-w-full overflow-hidden">
            <div class="grid w-full gap-1 opacity-75">
              {#each KEY_ROWS as row}
                <div class="flex w-full justify-center gap-1">
                  {#each row as key}
                    <div
                      class={[
                        'relative grid h-[clamp(30px,5vw,36px)] place-items-center rounded-md border border-border/70 bg-transparent text-[9px] font-medium text-muted-foreground transition-colors',
                        key === ' ' ? 'w-[clamp(148px,40vw,230px)]' : 'w-[clamp(22px,5.2vw,40px)]',
                        keyStateClass(key),
                        currentCharacter && key === currentCharacter.toLowerCase()
                          ? 'border-primary bg-secondary text-secondary-foreground opacity-100'
                          : ''
                      ].join(' ')}
                    >
                      <span>{formatKey(key)}</span>
                      {#if guideLevel === 0 && key !== ' '}
                        <small class="absolute right-0.5 top-0 text-[6px] font-normal opacity-45 max-[520px]:hidden">
                          {shortFinger(key)}
                        </small>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if selectedLessonIndex === null}
        <div class="mt-6 px-1">
          <div class="flex items-center" aria-label={`Session block ${blockIndex + 1} of ${TRAINING_BLOCKS.length}`}>
            {#each TRAINING_BLOCKS as block, index}
              <div class="flex flex-1 items-center last:flex-none">
                <span
                  class={[
                    'block size-1.5 shrink-0 rounded-full border',
                    index < blockIndex
                      ? 'border-success bg-success'
                      : index === blockIndex
                        ? 'border-primary bg-primary'
                        : 'border-border bg-background'
                  ].join(' ')}
                  title={block.name}
                ></span>

                {#if index < TRAINING_BLOCKS.length - 1}
                  <span
                    class={index < blockIndex
                      ? "mx-2 h-px flex-1 bg-success/40"
                      : "mx-2 h-px flex-1 bg-border"}
                  ></span>
                {/if}
              </div>
            {/each}
          </div>

          <div class="mt-2 text-center text-meta text-muted-foreground">
            {currentBlock.shortName}
          </div>
        </div>
        {/if}

        <div class="mt-6 flex items-center justify-between gap-3 border-t border-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            class="h-8 px-2 text-meta font-normal text-muted-foreground shadow-none"
            onclick={() => selectedLessonIndex === null ? startAdaptiveBlock() : startLesson(selectedLessonIndex)}
          >
            <RotateCcw class="size-3.5" strokeWidth={1.8} />
            Restart
          </Button>

          <div class="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              class="h-8 px-2 text-meta font-normal text-muted-foreground shadow-none"
              onclick={cycleGuide}
            >
              {guideLevel === 0 ? 'Less guide' : guideLevel === 1 ? 'Hide guide' : 'Show guide'}
            </Button>

            {#if runComplete}
              <Button
                variant="ghost"
                size="sm"
                class="h-8 px-2 text-meta font-medium text-primary shadow-none"
                onclick={selectedLessonIndex === null ? nextBlock : () => setPrimaryTab('lessons')}
              >
                {selectedLessonIndex === null ? 'Next →' : 'Lessons →'}
              </Button>
            {/if}
          </div>
        </div>
      </Tabs.Content>

      <Tabs.Content value="lessons" class="pt-6">
        <div class="mb-5">
          <h2 class="m-0 text-title font-semibold tracking-[-0.03em]">Lessons</h2>
          <p class="mt-1 text-meta text-muted-foreground">Learn the movement, then reinforce it in Train.</p>
        </div>

        <div class="border-y border-border">
          {#each LESSONS as lesson, index}
            <Button
              variant="ghost"
              class="grid h-auto w-full grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-full border-b border-border px-1 py-4 text-left font-normal whitespace-normal shadow-none last:border-b-0 hover:bg-muted/50 max-[560px]:grid-cols-[28px_minmax(0,1fr)]"
              onclick={() => startLesson(index)}
            >
              <span class="font-mono text-meta text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>

              <span class="min-w-0">
                <strong class="block text-meta font-medium text-foreground">{lesson[0]}</strong>
                <span class="mt-1 block text-meta leading-4 text-muted-foreground">{lesson[1]}</span>
              </span>

              <span class="text-meta text-muted-foreground max-[560px]:col-start-2">
                Practice →
              </span>
            </Button>
          {/each}
        </div>
      </Tabs.Content>

      <Tabs.Content value="test" class="min-w-0 pt-6">
        <div class="flex min-w-0 items-center justify-between gap-4 border-b border-border pb-3 max-[560px]:items-start max-[560px]:flex-col">
          <ToggleGroup.Root
            type="single"
            bind:value={controller.testMode}
            size="sm"
            spacing={1}
            class="max-w-full flex-wrap"
          >
            <ToggleGroup.Item value="time" class="rounded-full text-meta font-medium">Time</ToggleGroup.Item>
            <ToggleGroup.Item value="words" class="rounded-full text-meta" disabled>Words</ToggleGroup.Item>
            <ToggleGroup.Item value="paragraph" class="rounded-full text-meta" disabled>Paragraph</ToggleGroup.Item>
            <ToggleGroup.Item value="custom" class="rounded-full text-meta" disabled>Custom</ToggleGroup.Item>
          </ToggleGroup.Root>

          <div class="flex shrink-0 items-baseline gap-4 tabular-nums">
            <span><strong class="text-title font-semibold">{wpm}</strong> <small class="text-[9px] text-muted-foreground">wpm</small></span>
            <span class="text-meta text-muted-foreground">{accuracy}% acc</span>
          </div>
        </div>

        <div
          class="mt-8 min-h-[180px] w-full min-w-0 max-w-full overflow-x-clip outline-none ring-ring focus-visible:ring-2"
          role="textbox"
          aria-label="Typing test"
          tabindex="0"
        >
          <div class="block w-full min-w-0 max-w-full overflow-x-clip font-mono text-[clamp(20px,2.8vw,27px)] leading-[1.72] tracking-[-0.02em] text-muted-foreground/70">
            {#each textRuns(drillText) as run}
              {#if run.whitespace}
                {#each [...run.text] as character, localIndex}
                  <span class={characterClass(run.start + localIndex)}> </span><wbr />
                {/each}
              {:else}
                <span class="inline-block max-w-full break-all align-baseline">
                  {#each [...run.text] as character, localIndex}
                    <span class={characterClass(run.start + localIndex)}>{character}</span>
                  {/each}
                </span>
              {/if}
            {/each}
          </div>
        </div>

        <div class="flex justify-end border-t border-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            class="h-8 px-2 text-meta font-normal text-muted-foreground shadow-none"
            onclick={startTest}
          >
            <RotateCcw class="size-3.5" strokeWidth={1.8} />
            Restart
          </Button>
        </div>
      </Tabs.Content>

      <Tabs.Content value="progress" class="pt-6">
        <ProgressView {learningState} {preferences} />
      </Tabs.Content>

      <Tabs.Content value="settings" class="pt-6">
        <SettingsView {preferences} {audioUnavailable} onTogglePreference={togglePreference} onPreviewSound={previewKeyboardSound} />
      </Tabs.Content>
    </Tabs.Root>
  </div>
</section>
