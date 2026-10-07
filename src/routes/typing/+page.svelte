<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { RotateCcw, Settings2, Volume2, VolumeX } from 'lucide-svelte';
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

  type TypingView = 'train' | 'progress' | 'settings';
  type TrainMode = 'adaptive' | 'lessons' | 'test';

  const STATE_KEY = 'module-typing-state-v1';
  const PREFERENCES_KEY = 'module-typing-preferences-v1';
  const BLOCK_KEY = 'module-typing-block-v1';

  let activeView = $state<TypingView>('train');
  let trainMode = $state<TrainMode>('adaptive');
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
        activeView !== 'train' ||
        (trainMode !== 'adaptive' && trainMode !== 'test') ||
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
        correct ? (expected === ' ' ? 'space' : 'correct') : 'error'
      );
    }

    if (trainMode === 'adaptive') {
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

    if (trainMode === 'adaptive') {
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
    } else if (trainMode === 'test') {
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

  function setTrainMode(mode: TrainMode) {
    trainMode = mode;
    activeView = 'train';

    if (mode === 'adaptive') startAdaptiveBlock(false);
    if (mode === 'test') startTest();
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
    if (metric.mastered) return 'shadow-[inset_0_-3px_0_rgba(36,122,84,0.28)]';
    if (metric.status === 'weak') {
      return 'shadow-[inset_0_-3px_0_rgba(198,64,64,0.32)]';
    }

    return '';
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

<section class="mx-auto w-full max-w-[980px] px-4 pb-20 pt-8 max-[700px]:px-3 max-[700px]:pt-5">
  <div class="border-b border-border">
    <ToolHeader title="Typing" />

    <div class="-mt-2 flex items-center gap-5 overflow-x-auto">
      <button
        class={activeView === 'train' && trainMode === 'adaptive'
          ? "border-b-2 border-foreground pb-3 text-[13px] font-medium text-foreground"
          : "border-b-2 border-transparent pb-3 text-[13px] text-muted-foreground hover:text-foreground"}
        onclick={() => setTrainMode('adaptive')}
      >
        Train
      </button>
      <button
        class={activeView === 'train' && trainMode === 'lessons'
          ? "border-b-2 border-foreground pb-3 text-[13px] font-medium text-foreground"
          : "border-b-2 border-transparent pb-3 text-[13px] text-muted-foreground hover:text-foreground"}
        onclick={() => setTrainMode('lessons')}
      >
        Lessons
      </button>
      <button
        class={activeView === 'train' && trainMode === 'test'
          ? "border-b-2 border-foreground pb-3 text-[13px] font-medium text-foreground"
          : "border-b-2 border-transparent pb-3 text-[13px] text-muted-foreground hover:text-foreground"}
        onclick={() => setTrainMode('test')}
      >
        Test
      </button>
      <button
        class={activeView === 'progress'
          ? "border-b-2 border-foreground pb-3 text-[13px] font-medium text-foreground"
          : "border-b-2 border-transparent pb-3 text-[13px] text-muted-foreground hover:text-foreground"}
        onclick={() => (activeView = 'progress')}
      >
        Progress
      </button>

      <button
        class={activeView === 'settings'
          ? "ml-auto mb-2 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground"
          : "ml-auto mb-2 grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"}
        aria-label="Typing settings"
        onclick={() => (activeView = 'settings')}
      >
        <Settings2 class="size-4" strokeWidth={1.8} />
      </button>
    </div>
  </div>

  {#if activeView === 'train' && trainMode === 'adaptive'}
    <main class="mx-auto max-w-[840px] pt-10 max-[640px]:pt-7">
      <div class="flex items-start justify-between gap-6">
        <div>
          <h2 class="m-0 text-[15px] font-medium tracking-[-0.015em]">
            {currentBlock.name}
          </h2>
          <p class="mt-1 font-mono text-[12px] text-muted-foreground">
            {target}
          </p>
        </div>

        <div class="shrink-0 text-right text-[11px] leading-5 text-muted-foreground">
          <div>{blockIndex + 1} / {TRAINING_BLOCKS.length}</div>
          {#if minutesLeft > 0}
            <div>~{minutesLeft} min left</div>
          {/if}
        </div>
      </div>

      <div
        class="mt-12 min-h-[220px] outline-none ring-ring focus-visible:ring-2 max-[640px]:mt-9"
        role="textbox"
        aria-label="Typing practice"
        aria-multiline="true"
        tabindex="0"
      >
        <div class="font-mono text-[clamp(24px,3.5vw,34px)] leading-[1.72] tracking-[-0.025em] text-[#a6a6a0]">
          {#each [...drillText] as character, characterIndex}
            <span class={characterClass(characterIndex)}>{character === ' ' ? ' ' : character}</span>
          {/each}
        </div>
      </div>

      <div class="mt-7 flex min-h-8 items-center justify-between gap-5 border-b border-border pb-5 text-[12px] max-[620px]:items-start max-[620px]:flex-col">
        <div class="text-muted-foreground">
          {#if runComplete}
            <strong class="font-medium text-foreground">Complete</strong>
            <span class="mx-1.5">·</span>
            {accuracy}% accuracy
            <span class="mx-1.5">·</span>
            {wpm} wpm
          {:else if currentCharacter}
            <strong class="font-medium text-foreground">{fingerFor(currentCharacter)}</strong>
            <span class="mx-1.5">·</span>
            {currentCharacter === ' ' ? 'Space' : currentCharacter}
          {:else}
            Start typing
          {/if}
        </div>

        <div class="flex shrink-0 items-center gap-5 text-muted-foreground">
          <span>{accuracy}% accuracy</span>
          <span>{wpm} wpm</span>
        </div>
      </div>

      {#if guideLevel < 2}
        <div class="mt-7 overflow-x-auto">
          <div class="grid min-w-[650px] gap-1.5 opacity-75">
            {#each KEY_ROWS as row}
              <div class="flex justify-center gap-1.5">
                {#each row as key}
                  <div
                    class={[
                      'relative grid h-9 place-items-center rounded-md border border-border/70 bg-transparent text-[10px] font-medium text-muted-foreground transition-colors',
                      key === ' ' ? 'w-[245px]' : 'w-11',
                      keyStateClass(key),
                      currentCharacter && key === currentCharacter.toLowerCase()
                        ? 'border-primary bg-secondary text-secondary-foreground opacity-100'
                        : ''
                    ].join(' ')}
                  >
                    <span>{formatKey(key)}</span>
                    {#if guideLevel === 0 && key !== ' '}
                      <small class="absolute right-1 top-0.5 text-[7px] font-normal opacity-55">
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

      <div class="mt-8">
        <div class="flex items-center">
          {#each TRAINING_BLOCKS as block, index}
            <div class="flex flex-1 items-center last:flex-none">
              <div class="group relative flex flex-col items-center">
                <span
                  class={[
                    'block size-2 rounded-full border',
                    index < blockIndex
                      ? 'border-success bg-success'
                      : index === blockIndex
                        ? 'border-primary bg-primary'
                        : 'border-border bg-background'
                  ].join(' ')}
                  title={block.name}
                ></span>
                <span
                  class={index === blockIndex
                    ? "absolute top-4 whitespace-nowrap text-[9px] text-foreground"
                    : "absolute top-4 whitespace-nowrap text-[9px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"}
                >
                  {block.shortName}
                </span>
              </div>
              {#if index < TRAINING_BLOCKS.length - 1}
                <span
                  class={index < blockIndex
                    ? "mx-2 h-px flex-1 bg-success/45"
                    : "mx-2 h-px flex-1 bg-border"}
                ></span>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <div class="mt-9 flex items-center justify-between gap-3 border-t border-border pt-4">
        <button
          class="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
          onclick={() => startAdaptiveBlock()}
        >
          <RotateCcw class="size-3.5" strokeWidth={1.8} />
          Restart
        </button>

        <div class="flex items-center gap-4">
          <button
            class="text-[12px] text-muted-foreground hover:text-foreground"
            onclick={cycleGuide}
          >
            {guideLevel === 0 ? 'Less guide' : guideLevel === 1 ? 'Hide guide' : 'Show guide'}
          </button>

          {#if runComplete}
            <button
              class="text-[12px] font-medium text-primary hover:text-primary/80"
              onclick={nextBlock}
            >
              Next →
            </button>
          {/if}
        </div>
      </div>
    </main>
  {:else if activeView === 'train' && trainMode === 'lessons'}
    <main class="mx-auto max-w-[820px] pt-9">
      <div class="mb-6">
        <h2 class="m-0 text-[20px] font-semibold tracking-[-0.03em]">Lessons</h2>
        <p class="mt-1 text-[12px] text-muted-foreground">Learn the movement, then let Train reinforce it.</p>
      </div>

      <div class="border-y border-border">
        {#each LESSONS as lesson, index}
          <button
            class="grid w-full grid-cols-[42px_1fr_auto] items-center gap-3 border-b border-border py-4 text-left last:border-b-0 hover:bg-muted/50 max-[560px]:grid-cols-[34px_1fr]"
            onclick={() => setTrainMode('adaptive')}
          >
            <span class="font-mono text-[11px] text-muted-foreground">
              {String(index + 1).padStart(2, '0')}
            </span>

            <span>
              <strong class="block text-[13px] font-medium">{lesson[0]}</strong>
              <span class="mt-1 block text-[11px] text-muted-foreground">{lesson[1]}</span>
            </span>

            <span class="text-[11px] text-muted-foreground max-[560px]:col-start-2">
              {index < 2 ? 'Review →' : index === 2 ? 'Continue →' : 'Practice →'}
            </span>
          </button>
        {/each}
      </div>
    </main>
  {:else if activeView === 'train' && trainMode === 'test'}
    <main class="mx-auto max-w-[840px] pt-9">
      <div class="flex items-end justify-between gap-4 border-b border-border pb-4">
        <div class="flex items-center gap-5 text-[12px]">
          <button class="font-medium text-foreground">Time</button>
          <button class="text-muted-foreground">Words</button>
          <button class="text-muted-foreground">Paragraph</button>
          <button class="text-muted-foreground">Custom</button>
        </div>

        <div class="flex items-baseline gap-5">
          <span><strong class="text-[20px] font-semibold">{wpm}</strong> <small class="text-[10px] text-muted-foreground">wpm</small></span>
          <span class="text-[11px] text-muted-foreground">{accuracy}% acc</span>
        </div>
      </div>

      <div
        class="mt-12 min-h-[230px] outline-none ring-ring focus-visible:ring-2"
        role="textbox"
        aria-label="Typing test"
        tabindex="0"
      >
        <div class="font-mono text-[clamp(24px,3.5vw,34px)] leading-[1.72] tracking-[-0.025em] text-[#a6a6a0]">
          {#each [...drillText] as character, characterIndex}
            <span class={characterClass(characterIndex)}>{character === ' ' ? ' ' : character}</span>
          {/each}
        </div>
      </div>

      <div class="mt-6 flex justify-end border-t border-border pt-4">
        <button
          class="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
          onclick={startTest}
        >
          <RotateCcw class="size-3.5" strokeWidth={1.8} />
          Restart
        </button>
      </div>
    </main>
  {:else if activeView === 'progress'}
    <main class="mx-auto max-w-[820px] pt-9">
      <div>
        <h2 class="m-0 text-[20px] font-semibold tracking-[-0.03em]">Progress</h2>
        <p class="mt-1 text-[12px] text-muted-foreground">What changed, and what still needs work.</p>
      </div>

      <section class="mt-10 border-b border-border pb-9">
        <div class="flex items-end justify-between gap-4">
          <div>
            <span class="text-[11px] text-muted-foreground">Recent speed</span>
            <div class="mt-1 text-[28px] font-semibold tracking-[-0.04em]">
              {recentTrainingSessions[recentTrainingSessions.length - 1]?.wpm ?? 0}
              <span class="text-[11px] font-normal tracking-normal text-muted-foreground">wpm</span>
            </div>
          </div>
          <span class="text-[11px] text-muted-foreground">last {recentTrainingSessions.length || 0} sessions</span>
        </div>

        {#if recentTrainingSessions.length > 0}
          <div class="mt-7 flex h-[110px] items-end gap-2">
            {#each recentTrainingSessions as session}
              <div
                class="relative min-w-2 flex-1 border-t border-primary bg-secondary/55"
                style:height={trendHeight(session.wpm)}
                title={`${session.wpm} WPM · ${session.accuracy}%`}
              >
                <span class="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground">
                  {session.wpm}
                </span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="mt-6 text-[12px] text-muted-foreground">Finish a training block to start the trend.</p>
        {/if}
      </section>

      <div class="grid grid-cols-2 gap-12 py-9 max-[680px]:grid-cols-1 max-[680px]:gap-8">
        <section>
          <h3 class="m-0 text-[13px] font-medium">Needs work</h3>
          <div class="mt-4 divide-y divide-border">
            {#if weakKeyMetrics.length > 0}
              {#each weakKeyMetrics as metric}
                <div class="grid grid-cols-[42px_1fr_auto] items-center gap-3 py-3 text-[12px]">
                  <strong class="font-mono font-medium">{formatKey(metric.key)}</strong>
                  <div class="h-px bg-border">
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
              <p class="py-3 text-[12px] text-muted-foreground">More samples needed.</p>
            {/if}

            {#each weakTransitionMetrics.slice(0, 2) as metric}
              <div class="grid grid-cols-[42px_1fr_auto] items-center gap-3 py-3 text-[12px]">
                <strong class="font-mono font-medium">{metric.pair.toUpperCase()}</strong>
                <div class="h-px bg-border">
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
          <h3 class="m-0 text-[13px] font-medium">Review today</h3>
          <div class="mt-4 flex flex-wrap gap-x-5 gap-y-3 font-mono text-[13px]">
            {#if dueReviewKeys.length > 0}
              {#each dueReviewKeys as key}
                <span>{formatKey(key)}</span>
              {/each}
            {:else}
              <span class="font-sans text-[12px] text-muted-foreground">Nothing due.</span>
            {/if}
          </div>
        </section>
      </div>
    </main>
  {:else}
    <main class="mx-auto max-w-[760px] pt-9">
      <div class="border-b border-border pb-5">
        <h2 class="m-0 text-[20px] font-semibold tracking-[-0.03em]">Settings</h2>
      </div>

      <div class="divide-y divide-border">
        <div class="flex items-center justify-between gap-5 py-5">
          <div>
            <strong class="block text-[13px] font-medium">Keyboard sound</strong>
            <span class="mt-1 block text-[11px] text-muted-foreground">Quiet local key clicks.</span>
          </div>
          <button
            class={preferences.keyboardSound
              ? "inline-flex min-w-14 items-center justify-center gap-1.5 text-[12px] font-medium text-foreground"
              : "inline-flex min-w-14 items-center justify-center gap-1.5 text-[12px] text-muted-foreground"}
            aria-pressed={preferences.keyboardSound}
            onclick={() => togglePreference('keyboardSound')}
          >
            {#if preferences.keyboardSound}
              <Volume2 class="size-3.5" strokeWidth={1.8} /> On
            {:else}
              <VolumeX class="size-3.5" strokeWidth={1.8} /> Off
            {/if}
          </button>
        </div>

        <div class="flex items-center justify-between gap-5 py-5">
          <div>
            <strong class="block text-[13px] font-medium">Strict correction</strong>
            <span class="mt-1 block text-[11px] text-muted-foreground">Wrong keys stay on the current character.</span>
          </div>
          <button
            class={preferences.strictCorrection ? "text-[12px] font-medium" : "text-[12px] text-muted-foreground"}
            aria-pressed={preferences.strictCorrection}
            onclick={() => togglePreference('strictCorrection')}
          >
            {preferences.strictCorrection ? 'On' : 'Off'}
          </button>
        </div>

        <div class="flex items-center justify-between gap-5 py-5">
          <div>
            <strong class="block text-[13px] font-medium">Guide fading</strong>
            <span class="mt-1 block text-[11px] text-muted-foreground">Hide keyboard help as keys stabilize.</span>
          </div>
          <button
            class={preferences.automaticGuideFading ? "text-[12px] font-medium" : "text-[12px] text-muted-foreground"}
            aria-pressed={preferences.automaticGuideFading}
            onclick={() => togglePreference('automaticGuideFading')}
          >
            {preferences.automaticGuideFading ? 'On' : 'Off'}
          </button>
        </div>

        <div class="flex items-center justify-between gap-5 py-5">
          <div>
            <strong class="block text-[13px] font-medium">Mastery</strong>
            <span class="mt-1 block text-[11px] text-muted-foreground">
              {preferences.minSamples}+ samples · ≤ {preferences.masteryLatency}ms
            </span>
          </div>
          <span class="text-[12px]">{preferences.masteryAccuracy}%</span>
        </div>
      </div>
    </main>
  {/if}
</section>
