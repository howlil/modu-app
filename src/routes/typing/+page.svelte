<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { RotateCcw, Settings2 } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import { Switch } from '$lib/components/ui/switch/index.js';
  import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
  import ToolHeader from '#lib/components/ToolHeader.svelte';
  import {
    DEFAULT_TYPING_PREFERENCES,
    KEY_ROWS,
    LESSONS,
    TEST_TEXT,
    TRAINING_BLOCKS,
    createInitialTypingState,
    dueKeys,
    fingerFor,
    generateBlockText,
    keyMetric,
    markRetention,
    recommendedGuideLevel,
    recordTypingAttempt,
    syncRetention,
    targetLabel,
    weakKeys,
    weakTransitions,
    type TypingLearningState,
    type TypingPreferences
  } from '#lib/modules/typing/trainer.ts';
  import {
    disposeTypingAudio,
    playTypingKeySound
  } from '#lib/modules/typing/sounds.ts';

  type PrimaryTab = 'train' | 'lessons' | 'test' | 'progress' | 'settings';

  const STATE_KEY = 'module-typing-state-v1';
  const PREFERENCES_KEY = 'module-typing-preferences-v1';
  const BLOCK_KEY = 'module-typing-block-v1';

  let primaryTab = $state<PrimaryTab>('train');
  let testMode = $state('time');
  let learningState = $state<TypingLearningState>(createInitialTypingState());
  let preferences = $state<TypingPreferences>({ ...DEFAULT_TYPING_PREFERENCES });
  let blockIndex = $state(0);
  let drillText = $state('');
  let typedIndex = $state(0);
  let attempts = $state(0);
  let errors = $state(0);
  let startedAt = $state(0);
  let lastAdvanceAt = $state(0);
  let previousExpected = $state<string | null>(null);
  let wrongAtCursor = $state(false);
  let runComplete = $state(false);
  let manualGuideLevel = $state<number | null>(null);
  let clockNow = $state(0);
  let hydrated = $state(false);
  let persistTimer: number | null = null;
  let clockTimer: number | null = null;

  const currentBlock = $derived(TRAINING_BLOCKS[blockIndex]);
  const currentCharacter = $derived(drillText[typedIndex] ?? '');
  const elapsedMs = $derived(startedAt > 0 ? Math.max(0, clockNow - startedAt) : 0);
  const accuracy = $derived(
    attempts > 0 ? Math.round(((attempts - errors) / attempts) * 100) : 100
  );
  const wpm = $derived(
    elapsedMs > 0
      ? Math.round((typedIndex / 5) / (elapsedMs / 60_000))
      : 0
  );
  const adaptiveGuideLevel = $derived(
    recommendedGuideLevel(drillText, learningState, preferences)
  );
  const guideLevel = $derived(manualGuideLevel ?? adaptiveGuideLevel);
  const target = $derived(
    targetLabel(currentBlock.kind, learningState, preferences)
  );
  const weakKeyMetrics = $derived(weakKeys(learningState, preferences, 4));
  const weakTransitionMetrics = $derived(weakTransitions(learningState, 4));
  const dueReviewKeys = $derived(dueKeys(learningState).slice(0, 8));
  const recentTrainingSessions = $derived(
    learningState.sessions
      .filter((session) => session.kind !== 'test')
      .slice(-7)
  );
  const minutesLeft = $derived(
    TRAINING_BLOCKS.slice(blockIndex + 1).reduce(
      (total, block) => total + block.minutes,
      0
    )
  );

  onMount(() => {
    try {
      const savedState = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null');
      const savedPreferences = JSON.parse(
        localStorage.getItem(PREFERENCES_KEY) ?? 'null'
      );
      const savedBlock = Number(localStorage.getItem(BLOCK_KEY));

      if (savedState && typeof savedState === 'object') {
        learningState = {
          ...createInitialTypingState(),
          ...savedState,
          keyStats: savedState.keyStats ?? {},
          transitionStats: savedState.transitionStats ?? {},
          retention: savedState.retention ?? {},
          sessions: Array.isArray(savedState.sessions) ? savedState.sessions : []
        };
      }

      if (savedPreferences && typeof savedPreferences === 'object') {
        preferences = {
          ...DEFAULT_TYPING_PREFERENCES,
          ...savedPreferences
        };
      }

      if (Number.isInteger(savedBlock)) {
        blockIndex = Math.max(0, Math.min(TRAINING_BLOCKS.length - 1, savedBlock));
      }
    } catch {
      learningState = createInitialTypingState();
      preferences = { ...DEFAULT_TYPING_PREFERENCES };
    }

    syncRetention(learningState, preferences);
    startAdaptiveBlock(false);
    hydrated = true;

    clockTimer = window.setInterval(() => {
      if (startedAt > 0 && !runComplete) clockNow = performance.now();
    }, 100);

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isControl =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement;

      if (
        isControl ||
        (primaryTab !== 'train' && primaryTab !== 'test') ||
        runComplete ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      const typed =
        event.key === 'Spacebar'
          ? ' '
          : event.key.length === 1
            ? event.key
            : null;

      if (typed === null || currentCharacter === '') return;

      event.preventDefault();
      handleCharacter(typed);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      if (clockTimer !== null) window.clearInterval(clockTimer);
      if (persistTimer !== null) window.clearTimeout(persistTimer);
    }

    persistNow();
    disposeTypingAudio();
  });

  function persistNow() {
    if (typeof window === 'undefined' || !hydrated) return;

    localStorage.setItem(STATE_KEY, JSON.stringify(learningState));
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    localStorage.setItem(BLOCK_KEY, String(blockIndex));
  }

  function schedulePersist() {
    if (typeof window === 'undefined' || !hydrated) return;

    if (persistTimer !== null) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      persistTimer = null;
      persistNow();
    }, 180);
  }

  function resetRun(text: string) {
    drillText = text;
    typedIndex = 0;
    attempts = 0;
    errors = 0;
    startedAt = 0;
    lastAdvanceAt = 0;
    previousExpected = null;
    wrongAtCursor = false;
    runComplete = false;
    manualGuideLevel = null;
    clockNow = 0;
  }

  function startAdaptiveBlock(persist = true) {
    resetRun(
      generateBlockText(currentBlock.kind, learningState, preferences)
    );

    if (persist) schedulePersist();
  }

  function startTest() {
    resetRun(TEST_TEXT);
  }

  function handleCharacter(typed: string) {
    const expected = currentCharacter;
    if (!expected) return;

    const now = performance.now();

    if (startedAt === 0) {
      startedAt = now;
      lastAdvanceAt = now;
      clockNow = now;
    }

    const latency = Math.max(0, now - lastAdvanceAt);
    const correct = typed === expected;

    attempts += 1;
    if (!correct) errors += 1;

    if (preferences.keyboardSound) {
      playTypingKeySound(
        correct ? (expected === ' ' ? 'space' : 'correct') : 'error',
        expected
      );
    }

    if (primaryTab === 'train') {
      recordTypingAttempt(
        learningState,
        expected,
        correct,
        latency,
        previousExpected
      );
    }

    wrongAtCursor = !correct;

    if (correct || !preferences.strictCorrection) {
      previousExpected = expected;
      typedIndex += 1;
      lastAdvanceAt = now;
      wrongAtCursor = false;
    }

    if (typedIndex >= drillText.length) {
      completeRun(now);
    }

    schedulePersist();
  }

  function completeRun(now: number) {
    runComplete = true;
    clockNow = now;

    const durationMs = Math.max(1, now - startedAt);
    const finalAccuracy =
      attempts > 0 ? Math.round(((attempts - errors) / attempts) * 100) : 100;
    const finalWpm = Math.round((typedIndex / 5) / (durationMs / 60_000));

    if (primaryTab === 'train') {
      const reviewedKeys =
        currentBlock.kind === 'warmup' ? dueKeys(learningState) : [];

      learningState.sessions.push({
        at: Date.now(),
        kind: currentBlock.kind,
        wpm: finalWpm,
        accuracy: finalAccuracy,
        errors,
        durationMs
      });

      if (learningState.sessions.length > 90) {
        learningState.sessions = learningState.sessions.slice(-90);
      }

      syncRetention(learningState, preferences);

      if (reviewedKeys.length > 0) {
        markRetention(
          learningState,
          reviewedKeys,
          finalAccuracy >= preferences.masteryAccuracy
        );
      }
    } else if (primaryTab === 'test') {
      learningState.sessions.push({
        at: Date.now(),
        kind: 'test',
        wpm: finalWpm,
        accuracy: finalAccuracy,
        errors,
        durationMs
      });
    }

    schedulePersist();
  }

  function nextBlock() {
    blockIndex =
      blockIndex >= TRAINING_BLOCKS.length - 1 ? 0 : blockIndex + 1;
    startAdaptiveBlock();
  }

  function setPrimaryTab(tab: PrimaryTab) {
    primaryTab = tab;

    if (tab === 'train') startAdaptiveBlock(false);
    if (tab === 'test') startTest();
  }

  function cycleGuide() {
    const current = guideLevel;
    manualGuideLevel = current >= 2 ? 0 : current + 1;
  }

  function togglePreference(key: keyof TypingPreferences) {
    const value = preferences[key];

    if (typeof value === 'boolean') {
      preferences = {
        ...preferences,
        [key]: !value
      };
      schedulePersist();
    }
  }

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

  function trendHeight(wpmValue: number) {
    const values = recentTrainingSessions.map((session) => session.wpm);
    const max = Math.max(20, ...values);
    return `${Math.max(16, Math.round((wpmValue / max) * 100))}%`;
  }

  function formatKey(key: string) {
    return key === ' ' ? 'SPACE' : key.toUpperCase();
  }
</script>

<svelte:head>
  <title>Typing — Module</title>
</svelte:head>

<section class="mx-auto w-full max-w-[1180px] px-4 py-10 max-[760px]:px-2.5 max-[760px]:py-7">
  <div class="mx-auto w-full max-w-[860px] min-w-0">
    <ToolHeader title="Typing" />

    <Tabs.Root bind:value={primaryTab} class="gap-0">
      <Tabs.List
        variant="default"
        class="-mt-2 h-9 w-full min-w-0 justify-start rounded-full bg-muted/65 p-1"
      >
        <Tabs.Trigger
          value="train"
          class="h-7 flex-none rounded-full px-3 py-0 text-[12px] font-normal data-[state=active]:font-medium data-[state=active]:shadow-none"
          onclick={() => setPrimaryTab('train')}
        >
          Train
        </Tabs.Trigger>
        <Tabs.Trigger
          value="lessons"
          class="h-7 flex-none rounded-full px-3 py-0 text-[12px] font-normal data-[state=active]:font-medium data-[state=active]:shadow-none"
          onclick={() => setPrimaryTab('lessons')}
        >
          Lessons
        </Tabs.Trigger>
        <Tabs.Trigger
          value="test"
          class="h-7 flex-none rounded-full px-3 py-0 text-[12px] font-normal data-[state=active]:font-medium data-[state=active]:shadow-none"
          onclick={() => setPrimaryTab('test')}
        >
          Test
        </Tabs.Trigger>
        <Tabs.Trigger
          value="progress"
          class="h-7 flex-none rounded-full px-3 py-0 text-[12px] font-normal data-[state=active]:font-medium data-[state=active]:shadow-none"
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

      <Tabs.Content value="train" class="min-w-0 pt-7 max-[640px]:pt-6">
        <div class="flex min-w-0 items-start justify-between gap-5">
          <div class="min-w-0">
            <h2 class="m-0 truncate text-[14px] font-medium tracking-[-0.015em]">
              {currentBlock.name}
            </h2>
            <p class="mt-1 truncate font-mono text-[11px] text-muted-foreground">
              {target}
            </p>
          </div>

          <span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {blockIndex + 1} / {TRAINING_BLOCKS.length}
            {#if minutesLeft > 0}
              <span class="ml-2">~{minutesLeft}m</span>
            {/if}
          </span>
        </div>

        <div
          class="mt-8 min-h-[168px] w-full min-w-0 max-w-full overflow-x-clip outline-none ring-ring focus-visible:ring-2 max-[640px]:mt-7 max-[640px]:min-h-[150px]"
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

        <div class="flex min-w-0 items-center justify-between gap-4 border-b border-border pb-4 text-[11px] max-[560px]:items-start max-[560px]:flex-col max-[560px]:gap-2.5">
          <div class="min-w-0 text-muted-foreground">
            {#if runComplete}
              <strong class="font-medium text-foreground">Complete</strong>
            {:else if currentCharacter}
              <strong class="font-medium text-foreground">{fingerFor(currentCharacter)}</strong>
              <span class="mx-1.5">·</span>
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

        <div class="mt-7 px-1">
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

          <div class="mt-2 text-center text-[10px] text-muted-foreground">
            {currentBlock.shortName}
          </div>
        </div>

        <div class="mt-6 flex items-center justify-between gap-3 border-t border-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            class="h-8 px-2 text-[11px] font-normal text-muted-foreground shadow-none"
            onclick={() => startAdaptiveBlock()}
          >
            <RotateCcw class="size-3.5" strokeWidth={1.8} />
            Restart
          </Button>

          <div class="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              class="h-8 px-2 text-[11px] font-normal text-muted-foreground shadow-none"
              onclick={cycleGuide}
            >
              {guideLevel === 0 ? 'Less guide' : guideLevel === 1 ? 'Hide guide' : 'Show guide'}
            </Button>

            {#if runComplete}
              <Button
                variant="ghost"
                size="sm"
                class="h-8 px-2 text-[11px] font-medium text-primary shadow-none"
                onclick={nextBlock}
              >
                Next →
              </Button>
            {/if}
          </div>
        </div>
      </Tabs.Content>

      <Tabs.Content value="lessons" class="pt-7">
        <div class="mb-5">
          <h2 class="m-0 text-[18px] font-semibold tracking-[-0.03em]">Lessons</h2>
          <p class="mt-1 text-[11px] text-muted-foreground">Learn the movement, then reinforce it in Train.</p>
        </div>

        <div class="border-y border-border">
          {#each LESSONS as lesson, index}
            <Button
              variant="ghost"
              class="grid h-auto w-full grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-full border-b border-border px-1 py-3.5 text-left font-normal whitespace-normal shadow-none last:border-b-0 hover:bg-muted/50 max-[560px]:grid-cols-[28px_minmax(0,1fr)]"
              onclick={() => setPrimaryTab('train')}
            >
              <span class="font-mono text-[10px] text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>

              <span class="min-w-0">
                <strong class="block text-[12px] font-medium text-foreground">{lesson[0]}</strong>
                <span class="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{lesson[1]}</span>
              </span>

              <span class="text-[10px] text-muted-foreground max-[560px]:col-start-2">
                {index < 2 ? 'Review →' : index === 2 ? 'Continue →' : 'Practice →'}
              </span>
            </Button>
          {/each}
        </div>
      </Tabs.Content>

      <Tabs.Content value="test" class="min-w-0 pt-7">
        <div class="flex min-w-0 items-center justify-between gap-4 border-b border-border pb-3 max-[560px]:items-start max-[560px]:flex-col">
          <ToggleGroup.Root
            type="single"
            bind:value={testMode}
            size="sm"
            spacing={1}
            class="max-w-full flex-wrap"
          >
            <ToggleGroup.Item value="time" class="rounded-full text-[11px] font-medium">Time</ToggleGroup.Item>
            <ToggleGroup.Item value="words" class="rounded-full text-[11px]" disabled>Words</ToggleGroup.Item>
            <ToggleGroup.Item value="paragraph" class="rounded-full text-[11px]" disabled>Paragraph</ToggleGroup.Item>
            <ToggleGroup.Item value="custom" class="rounded-full text-[11px]" disabled>Custom</ToggleGroup.Item>
          </ToggleGroup.Root>

          <div class="flex shrink-0 items-baseline gap-4 tabular-nums">
            <span><strong class="text-[18px] font-semibold">{wpm}</strong> <small class="text-[9px] text-muted-foreground">wpm</small></span>
            <span class="text-[10px] text-muted-foreground">{accuracy}% acc</span>
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
            class="h-8 px-2 text-[11px] font-normal text-muted-foreground shadow-none"
            onclick={startTest}
          >
            <RotateCcw class="size-3.5" strokeWidth={1.8} />
            Restart
          </Button>
        </div>
      </Tabs.Content>

      <Tabs.Content value="progress" class="pt-7">
        <div>
          <h2 class="m-0 text-[18px] font-semibold tracking-[-0.03em]">Progress</h2>
          <p class="mt-1 text-[11px] text-muted-foreground">What changed, and what still needs work.</p>
        </div>

        <section class="mt-8 border-b border-border pb-7">
          <div class="flex items-end justify-between gap-4">
            <div>
              <span class="text-[10px] text-muted-foreground">Recent speed</span>
              <div class="mt-0.5 text-[26px] font-semibold tracking-[-0.04em]">
                {recentTrainingSessions[recentTrainingSessions.length - 1]?.wpm ?? 0}
                <span class="text-[10px] font-normal tracking-normal text-muted-foreground">wpm</span>
              </div>
            </div>
            <span class="text-[10px] text-muted-foreground">{recentTrainingSessions.length} sessions</span>
          </div>

          {#if recentTrainingSessions.length > 0}
            <div class="mt-6 flex h-[96px] items-end gap-1.5">
              {#each recentTrainingSessions as session}
                <div
                  class="relative min-w-1 flex-1 border-t border-primary bg-secondary/45"
                  style:height={trendHeight(session.wpm)}
                  title={`${session.wpm} WPM · ${session.accuracy}%`}
                ></div>
              {/each}
            </div>
          {:else}
            <p class="mt-5 text-[11px] text-muted-foreground">Finish a training block to start the trend.</p>
          {/if}
        </section>

        <div class="grid grid-cols-2 gap-10 py-7 max-[680px]:grid-cols-1 max-[680px]:gap-7">
          <section class="min-w-0">
            <h3 class="m-0 text-[12px] font-medium">Needs work</h3>
            <div class="mt-3 divide-y divide-border">
              {#if weakKeyMetrics.length > 0}
                {#each weakKeyMetrics as metric}
                  <div class="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-[11px]">
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
                <p class="py-2.5 text-[11px] text-muted-foreground">More samples needed.</p>
              {/if}

              {#each weakTransitionMetrics.slice(0, 2) as metric}
                <div class="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-[11px]">
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
            <h3 class="m-0 text-[12px] font-medium">Review today</h3>
            <div class="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[12px]">
              {#if dueReviewKeys.length > 0}
                {#each dueReviewKeys as key}
                  <span>{formatKey(key)}</span>
                {/each}
              {:else}
                <span class="font-sans text-[11px] text-muted-foreground">Nothing due.</span>
              {/if}
            </div>
          </section>
        </div>
      </Tabs.Content>

      <Tabs.Content value="settings" class="pt-7">
        <div class="border-b border-border pb-4">
          <h2 class="m-0 text-[18px] font-semibold tracking-[-0.03em]">Settings</h2>
        </div>

        <div class="divide-y divide-border">
          <div class="flex items-center justify-between gap-5 py-4">
            <div class="min-w-0">
              <strong class="block text-[12px] font-medium">Keyboard sound</strong>
              <span class="mt-0.5 block text-[10px] text-muted-foreground">Mechanical key clicks.</span>
            </div>
            <Switch
              checked={preferences.keyboardSound}
              aria-label="Keyboard sound"
              onclick={() => togglePreference('keyboardSound')}
            />
          </div>

          <div class="flex items-center justify-between gap-5 py-4">
            <div class="min-w-0">
              <strong class="block text-[12px] font-medium">Strict correction</strong>
              <span class="mt-0.5 block text-[10px] text-muted-foreground">Wrong keys stay on the current character.</span>
            </div>
            <Switch
              checked={preferences.strictCorrection}
              aria-label="Strict correction"
              onclick={() => togglePreference('strictCorrection')}
            />
          </div>

          <div class="flex items-center justify-between gap-5 py-4">
            <div class="min-w-0">
              <strong class="block text-[12px] font-medium">Guide fading</strong>
              <span class="mt-0.5 block text-[10px] text-muted-foreground">Hide keyboard help as keys stabilize.</span>
            </div>
            <Switch
              checked={preferences.automaticGuideFading}
              aria-label="Guide fading"
              onclick={() => togglePreference('automaticGuideFading')}
            />
          </div>

          <div class="flex items-center justify-between gap-5 py-4">
            <div class="min-w-0">
              <strong class="block text-[12px] font-medium">Mastery</strong>
              <span class="mt-0.5 block text-[10px] text-muted-foreground">
                {preferences.minSamples}+ samples · ≤ {preferences.masteryLatency}ms
              </span>
            </div>
            <span class="shrink-0 text-[11px] tabular-nums">{preferences.masteryAccuracy}%</span>
          </div>
        </div>
      </Tabs.Content>
    </Tabs.Root>
  </div>
</section>
