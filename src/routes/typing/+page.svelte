<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { RotateCcw, Settings2, Volume2, VolumeX } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button/index.js';
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

  const TRAIN_MODE_OPTIONS: Array<{ id: TrainMode; label: string }> = [
    { id: 'adaptive', label: 'Adaptive' },
    { id: 'lessons', label: 'Lessons' },
    { id: 'test', label: 'Test' }
  ];

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
  <title>Typing Trainer — Module</title>
</svelte:head>

<section class="mx-auto w-full max-w-[1080px] px-4 pb-16 pt-8 max-[700px]:px-2.5 max-[700px]:pt-5">
  <div class="flex items-end justify-between gap-4 border-b pb-0 max-[760px]:items-start max-[760px]:flex-col">
    <ToolHeader
      title="Typing"
      description="Adaptive practice for accuracy, weak keys, and slow transitions."
    />

    <div class="flex items-center gap-1 max-[760px]:w-full">
      <Button
        variant={activeView === 'train' ? 'ghost' : 'ghost'}
        size="sm"
        class={activeView === 'train'
          ? "h-9 rounded-none border-b-2 border-foreground px-3 text-foreground"
          : "h-9 rounded-none border-b-2 border-transparent px-3 text-muted-foreground"}
        onclick={() => (activeView = 'train')}
      >
        Train
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class={activeView === 'progress'
          ? "h-9 rounded-none border-b-2 border-foreground px-3 text-foreground"
          : "h-9 rounded-none border-b-2 border-transparent px-3 text-muted-foreground"}
        onclick={() => (activeView = 'progress')}
      >
        Progress
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class={activeView === 'settings'
          ? "ml-auto size-9 bg-muted text-foreground"
          : "ml-auto size-9 text-muted-foreground"}
        aria-label="Typing settings"
        onclick={() => (activeView = 'settings')}
      >
        <Settings2 class="size-4" strokeWidth={1.8} />
      </Button>
    </div>
  </div>

  {#if activeView === 'train'}
    <div class="mt-5 flex items-center justify-between gap-3 max-[640px]:items-start max-[640px]:flex-col">
      <div class="inline-flex rounded-xl border bg-muted p-1">
        {#each TRAIN_MODE_OPTIONS as option}
          <Button
            variant={trainMode === option.id ? 'secondary' : 'ghost'}
            size="sm"
            class="h-8 rounded-lg px-3 text-xs font-normal shadow-none"
            onclick={() => setTrainMode(option.id)}
          >
            {option.label}
          </Button>
        {/each}
      </div>

      {#if trainMode === 'adaptive'}
        <span class="text-xs text-muted-foreground">
          Today · {blockIndex + 1} of {TRAINING_BLOCKS.length}
          {#if minutesLeft > 0}
            · ~{minutesLeft} min left
          {/if}
        </span>
      {/if}
    </div>

    {#if trainMode === 'adaptive'}
      <section class="mt-4 rounded-[20px] border bg-card p-5 shadow-[0_10px_30px_rgba(24,30,50,0.045)] max-[640px]:p-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="m-0 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Current focus
            </p>
            <h2 class="mb-1 mt-1 text-base font-semibold tracking-[-0.02em]">
              {currentBlock.name}
            </h2>
            <p class="m-0 text-xs leading-5 text-muted-foreground">
              {currentBlock.description}
            </p>
          </div>

          <span class="shrink-0 rounded-full bg-secondary px-2.5 py-1.5 text-[11px] text-secondary-foreground">
            Block {blockIndex + 1} of {TRAINING_BLOCKS.length}
          </span>
        </div>

        <div class="mt-5 grid grid-cols-3 gap-2 max-[560px]:grid-cols-2">
          <div class="rounded-xl bg-muted px-3 py-2.5">
            <span class="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">Accuracy</span>
            <strong class="mt-1 block text-lg font-semibold">{accuracy}%</strong>
          </div>
          <div class="rounded-xl bg-muted px-3 py-2.5">
            <span class="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">Target</span>
            <strong class="mt-1 block truncate text-xs font-medium text-foreground">{target}</strong>
          </div>
          <div class="rounded-xl bg-muted px-3 py-2.5 max-[560px]:col-span-2">
            <span class="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">Speed</span>
            <strong class="mt-1 block text-lg font-semibold">
              {wpm}
              <span class="text-[10px] font-normal text-muted-foreground">WPM</span>
            </strong>
          </div>
        </div>

        <div
          class="mt-5 min-h-[184px] rounded-2xl border bg-background p-5 outline-none ring-ring focus-visible:ring-2 max-[640px]:p-4"
          role="textbox"
          aria-label="Typing practice"
          aria-multiline="true"
          tabindex="0"
        >
          <div class="font-mono text-[clamp(18px,2.4vw,25px)] leading-[1.75] tracking-[0.01em] text-muted-foreground">
            {#each [...drillText] as character, characterIndex}
              <span class={characterClass(characterIndex)}>{character === ' ' ? ' ' : character}</span>
            {/each}
          </div>

          <div class="mt-5 flex items-center justify-between gap-4 border-t pt-3 text-xs text-muted-foreground max-[620px]:items-start max-[620px]:flex-col">
            {#if runComplete}
              <span>
                <strong class="font-medium text-foreground">Complete.</strong>
                {accuracy}% accuracy · {wpm} WPM.
              </span>
            {:else if currentCharacter}
              <span>
                <strong class="font-medium text-foreground">{fingerFor(currentCharacter)}</strong>
                · press “{currentCharacter === ' ' ? 'Space' : currentCharacter}”
                {currentCharacter === ' ' ? '' : ', then return home.'}
              </span>
            {:else}
              <span>Start typing to begin.</span>
            {/if}

            <span class="shrink-0">Accuracy first. Speed follows.</span>
          </div>
        </div>

        <div class="mt-3 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            class="text-muted-foreground"
            onclick={() => startAdaptiveBlock()}
          >
            <RotateCcw class="size-3.5" strokeWidth={1.8} />
            Restart
          </Button>

          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" onclick={cycleGuide}>
              {guideLevel === 0 ? 'Reduce guide' : guideLevel === 1 ? 'Hide guide' : 'Show guide'}
            </Button>
            <Button size="sm" disabled={!runComplete} onclick={nextBlock}>
              Next block
            </Button>
          </div>
        </div>
      </section>

      {#if guideLevel < 2}
        <section class="mt-3 rounded-2xl border bg-card p-4">
          <div class="flex items-center justify-between gap-3">
            <strong class="text-xs font-medium">Keyboard guide</strong>
            <span class="text-[11px] text-muted-foreground">
              blue next · red weak · green mastered
            </span>
          </div>

          <div class="mt-4 grid gap-1.5 overflow-x-auto">
            {#each KEY_ROWS as row}
              <div class="flex min-w-[660px] justify-center gap-1.5">
                {#each row as key}
                  <div
                    class={[
                      'relative grid h-10 place-items-center rounded-lg border bg-muted text-[11px] font-medium transition-colors',
                      key === ' ' ? 'w-[260px]' : 'w-12',
                      keyStateClass(key),
                      currentCharacter && key === currentCharacter.toLowerCase()
                        ? 'border-primary bg-secondary text-secondary-foreground'
                        : ''
                    ].join(' ')}
                  >
                    <span>{formatKey(key)}</span>
                    {#if guideLevel === 0 && key !== ' '}
                      <small class="absolute right-1 top-0.5 text-[7px] font-normal text-muted-foreground">
                        {shortFinger(key)}
                      </small>
                    {/if}
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <section class="mt-3 rounded-2xl border bg-card p-4">
        <div class="flex items-center justify-between gap-3">
          <strong class="text-xs font-medium">Today’s session</strong>
          <span class="text-[11px] text-muted-foreground">12 min target</span>
        </div>

        <div class="mt-3 grid grid-cols-5 gap-2 max-[760px]:grid-cols-1">
          {#each TRAINING_BLOCKS as block, index}
            <div
              class={[
                'min-h-[74px] rounded-xl border p-2.5',
                index === blockIndex
                  ? 'border-primary/25 bg-secondary'
                  : index < blockIndex
                    ? 'border-transparent bg-muted opacity-55'
                    : 'border-transparent bg-muted'
              ].join(' ')}
            >
              <span
                class={[
                  'mb-2 block size-1.5 rounded-full',
                  index === blockIndex
                    ? 'bg-primary'
                    : index < blockIndex
                      ? 'bg-success'
                      : 'bg-border'
                ].join(' ')}
              ></span>
              <strong class="block text-[11px] font-medium">{block.shortName}</strong>
              <span class="mt-1 block text-[10px] text-muted-foreground">
                {block.minutes} min
              </span>
            </div>
          {/each}
        </div>
      </section>
    {:else if trainMode === 'lessons'}
      <section class="mt-4 rounded-[20px] border bg-card p-5">
        <h2 class="m-0 text-base font-semibold tracking-[-0.02em]">Lessons</h2>
        <p class="mt-1 text-xs text-muted-foreground">
          Learn movements first. Adaptive practice reinforces them later.
        </p>

        <div class="mt-5 grid gap-2">
          {#each LESSONS as lesson, index}
            <div class="grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-xl border p-3 max-[560px]:grid-cols-[36px_1fr]">
              <div class="grid size-9 place-items-center rounded-lg bg-muted text-[11px] text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </div>
              <div>
                <h3 class="m-0 text-xs font-medium">{lesson[0]}</h3>
                <p class="mt-1 text-[11px] text-muted-foreground">{lesson[1]}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                class="max-[560px]:col-start-2 max-[560px]:w-fit"
                onclick={() => setTrainMode('adaptive')}
              >
                {index < 2 ? 'Review' : 'Practice'}
              </Button>
            </div>
          {/each}
        </div>
      </section>
    {:else}
      <section class="mt-4 rounded-[20px] border bg-card p-5">
        <div>
          <h2 class="m-0 text-base font-semibold tracking-[-0.02em]">Typing test</h2>
          <p class="mt-1 text-xs text-muted-foreground">
            Measure performance without changing your mastery model.
          </p>
        </div>

        <div class="mt-4 flex flex-wrap gap-1.5">
          {#each ['Time', 'Words', 'Paragraph', 'Custom'] as mode, index}
            <Button
              variant={index === 0 ? 'secondary' : 'ghost'}
              size="sm"
              class="h-8 rounded-full px-3 text-xs font-normal"
            >
              {mode}
            </Button>
          {/each}
        </div>

        <div
          class="mt-5 min-h-[190px] rounded-2xl border bg-background p-5 outline-none ring-ring focus-visible:ring-2"
          role="textbox"
          aria-label="Typing test"
          tabindex="0"
        >
          <div class="mb-4 flex items-end justify-between gap-4 border-b pb-3">
            <div>
              <strong class="text-3xl font-semibold tracking-[-0.04em]">{wpm}</strong>
              <span class="ml-1 text-xs text-muted-foreground">WPM</span>
            </div>
            <span class="text-xs text-muted-foreground">{accuracy}% accuracy</span>
          </div>

          <div class="font-mono text-[clamp(18px,2.4vw,25px)] leading-[1.75] text-muted-foreground">
            {#each [...drillText] as character, characterIndex}
              <span class={characterClass(characterIndex)}>{character === ' ' ? ' ' : character}</span>
            {/each}
          </div>
        </div>

        <div class="mt-3 flex justify-end">
          <Button variant="outline" size="sm" onclick={startTest}>
            <RotateCcw class="size-3.5" strokeWidth={1.8} />
            Restart test
          </Button>
        </div>
      </section>
    {/if}
  {:else if activeView === 'progress'}
    <section class="mt-5 rounded-[20px] border bg-card p-5">
      <h2 class="m-0 text-base font-semibold tracking-[-0.02em]">Progress</h2>
      <p class="mt-1 text-xs text-muted-foreground">
        Only signals that change what you should practice next.
      </p>

      <div class="mt-5 grid grid-cols-[1.1fr_0.9fr] gap-3 max-[760px]:grid-cols-1">
        <div class="rounded-2xl bg-muted p-4">
          <p class="m-0 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Last 7 training sessions
          </p>

          {#if recentTrainingSessions.length > 0}
            <div class="mt-6 flex h-[150px] items-end gap-2">
              {#each recentTrainingSessions as session}
                <div
                  class="relative min-w-2 flex-1 rounded-t-md bg-secondary"
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
            <div class="mt-4 rounded-xl border border-dashed bg-card p-5 text-xs text-muted-foreground">
              Finish a training block to start the trend.
            </div>
          {/if}
        </div>

        <div class="rounded-2xl bg-muted p-4">
          <p class="m-0 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Needs work
          </p>

          <div class="mt-3 grid gap-2">
            {#if weakKeyMetrics.length > 0}
              {#each weakKeyMetrics as metric}
                <div class="grid grid-cols-[34px_1fr_auto] items-center gap-2 text-[11px]">
                  <strong>{formatKey(metric.key)}</strong>
                  <div class="h-1.5 overflow-hidden rounded-full bg-border">
                    <div
                      class="h-full rounded-full bg-primary/35"
                      style:width={`${Math.max(8, Math.round((1 - metric.weakness) * 100))}%`}
                    ></div>
                  </div>
                  <span class="text-muted-foreground">
                    {metric.accuracy === null ? '—' : `${Math.round(metric.accuracy)}%`}
                  </span>
                </div>
              {/each}
            {:else}
              <span class="text-xs text-muted-foreground">
                Keep training. Reliable weak-key data needs a few samples.
              </span>
            {/if}

            {#each weakTransitionMetrics.slice(0, 2) as metric}
              <div class="grid grid-cols-[34px_1fr_auto] items-center gap-2 text-[11px]">
                <strong>{metric.pair.toUpperCase()}</strong>
                <div class="h-1.5 overflow-hidden rounded-full bg-border">
                  <div
                    class="h-full rounded-full bg-primary/35"
                    style:width={`${Math.max(8, Math.round((1 - metric.weakness) * 100))}%`}
                  ></div>
                </div>
                <span class="text-muted-foreground">
                  {metric.latency === null ? 'slow' : `${Math.round(metric.latency)}ms`}
                </span>
              </div>
            {/each}
          </div>

          <p class="mb-0 mt-6 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Due review
          </p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            {#if dueReviewKeys.length > 0}
              {#each dueReviewKeys as key}
                <span class="rounded-lg border bg-card px-2 py-1 font-mono text-[11px]">
                  {formatKey(key)}
                </span>
              {/each}
            {:else}
              <span class="text-xs text-muted-foreground">Nothing due yet.</span>
            {/if}
          </div>
        </div>
      </div>
    </section>
  {:else}
    <section class="mt-5 rounded-[20px] border bg-card p-5">
      <h2 class="m-0 text-base font-semibold tracking-[-0.02em]">Settings</h2>
      <p class="mt-1 text-xs text-muted-foreground">
        Training preferences apply immediately and stay in this browser.
      </p>

      <div class="mt-4 divide-y">
        <div class="flex items-center justify-between gap-5 py-4">
          <div>
            <strong class="block text-xs font-medium">Keyboard sound</strong>
            <span class="mt-1 block text-[11px] text-muted-foreground">
              Quiet procedural key clicks. No audio files are downloaded.
            </span>
          </div>
          <Button
            variant={preferences.keyboardSound ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={preferences.keyboardSound}
            onclick={() => togglePreference('keyboardSound')}
          >
            {#if preferences.keyboardSound}
              <Volume2 class="size-3.5" strokeWidth={1.8} />
              On
            {:else}
              <VolumeX class="size-3.5" strokeWidth={1.8} />
              Off
            {/if}
          </Button>
        </div>

        <div class="flex items-center justify-between gap-5 py-4">
          <div>
            <strong class="block text-xs font-medium">Strict correction</strong>
            <span class="mt-1 block text-[11px] text-muted-foreground">
              Wrong keys do not advance the cursor.
            </span>
          </div>
          <Button
            variant={preferences.strictCorrection ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={preferences.strictCorrection}
            onclick={() => togglePreference('strictCorrection')}
          >
            {preferences.strictCorrection ? 'On' : 'Off'}
          </Button>
        </div>

        <div class="flex items-center justify-between gap-5 py-4">
          <div>
            <strong class="block text-xs font-medium">Automatic guide fading</strong>
            <span class="mt-1 block text-[11px] text-muted-foreground">
              Reduce keyboard help as the practiced keys stabilize.
            </span>
          </div>
          <Button
            variant={preferences.automaticGuideFading ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={preferences.automaticGuideFading}
            onclick={() => togglePreference('automaticGuideFading')}
          >
            {preferences.automaticGuideFading ? 'On' : 'Off'}
          </Button>
        </div>

        <div class="flex items-center justify-between gap-5 py-4">
          <div>
            <strong class="block text-xs font-medium">Mastery threshold</strong>
            <span class="mt-1 block text-[11px] text-muted-foreground">
              {preferences.minSamples}+ samples · ≤ {preferences.masteryLatency}ms average latency.
            </span>
          </div>
          <span class="rounded-lg border bg-muted px-2.5 py-1.5 text-xs">
            {preferences.masteryAccuracy}%
          </span>
        </div>
      </div>
    </section>
  {/if}
</section>
