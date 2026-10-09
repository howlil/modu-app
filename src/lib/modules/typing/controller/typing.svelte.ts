import { onDestroy, onMount, tick } from 'svelte';
  import {
    DEFAULT_TYPING_PREFERENCES,
    KEY_ROWS,
    LESSONS,
    LESSON_DRILLS,
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
  } from '#lib/modules/typing/core/trainer.ts';
  import {
    disposeTypingAudio,
    playTypingKeySound
  } from '#lib/modules/typing/adapters/sounds.ts';

  type PrimaryTab = 'train' | 'lessons' | 'test' | 'progress' | 'settings';

  import { calculateTypingMetrics, evaluateTypingInput } from '#lib/modules/typing/core/session.ts';
  import { loadTypingSnapshot, saveTypingSnapshot } from '#lib/modules/typing/adapters/persistence.ts';

export function createTypingController() {
  let primaryTab = $state<PrimaryTab>('train');
  let selectedLessonIndex = $state<number | null>(null);
  let trainingSurface: HTMLDivElement | undefined;
  let testMode = $state('time');
  let learningState = $state<TypingLearningState>(createInitialTypingState());
  let preferences = $state<TypingPreferences>({ ...DEFAULT_TYPING_PREFERENCES });
  let audioUnavailable = $state(false);
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
  const accuracy = $derived(calculateTypingMetrics(typedIndex, attempts, errors, elapsedMs).accuracy);
  const wpm = $derived(calculateTypingMetrics(typedIndex, attempts, errors, elapsedMs).wpm);
  const adaptiveGuideLevel = $derived(
    recommendedGuideLevel(drillText, learningState, preferences)
  );
  const guideLevel = $derived(manualGuideLevel ?? adaptiveGuideLevel);
  const target = $derived(
    selectedLessonIndex === null
      ? targetLabel(currentBlock.kind, learningState, preferences)
      : LESSONS[selectedLessonIndex][1]
  );
  const minutesLeft = $derived(
    TRAINING_BLOCKS.slice(blockIndex + 1).reduce(
      (total, block) => total + block.minutes,
      0
    )
  );

  onMount(() => {
    try {
      const { savedState, savedPreferences, savedBlock } = loadTypingSnapshot();

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

    saveTypingSnapshot(learningState, preferences, blockIndex);
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
    selectedLessonIndex = null;
    resetRun(
      generateBlockText(currentBlock.kind, learningState, preferences)
    );

    if (persist) schedulePersist();
  }

  function startTest() {
    selectedLessonIndex = null;
    resetRun(TEST_TEXT);
  }

  async function startLesson(index: number) {
    selectedLessonIndex = index;
    primaryTab = 'train';
    resetRun(LESSON_DRILLS[index] ?? LESSON_DRILLS[0]);
    await tick();
    trainingSurface?.focus();
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
    const { correct, advance } = evaluateTypingInput(expected, typed, preferences.strictCorrection);

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

    if (advance) {
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
    const { accuracy: finalAccuracy, wpm: finalWpm } = calculateTypingMetrics(
      typedIndex,
      attempts,
      errors,
      durationMs
    );

    if (primaryTab === 'train') {
      const reviewedKeys =
        selectedLessonIndex === null && currentBlock.kind === 'warmup'
          ? dueKeys(learningState)
          : [];

      learningState.sessions.push({
        at: Date.now(),
        kind: selectedLessonIndex === null ? currentBlock.kind : 'transfer',
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

  function previewKeyboardSound() {
    audioUnavailable = !playTypingKeySound('correct', 'f');
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

  return {
    get primaryTab() { return primaryTab; },
    set primaryTab(value: PrimaryTab) { primaryTab = value; },
    get selectedLessonIndex() { return selectedLessonIndex; },
    get trainingSurface() { return trainingSurface; },
    set trainingSurface(value: HTMLDivElement | undefined) { trainingSurface = value; },
    get testMode() { return testMode; },
    set testMode(value: string) { testMode = value; },
    get learningState() { return learningState; },
    get preferences() { return preferences; },
    get audioUnavailable() { return audioUnavailable; },
    get blockIndex() { return blockIndex; },
    get drillText() { return drillText; },
    get typedIndex() { return typedIndex; },
    get attempts() { return attempts; },
    get errors() { return errors; },
    get startedAt() { return startedAt; },
    get wrongAtCursor() { return wrongAtCursor; },
    get runComplete() { return runComplete; },
    get clockNow() { return clockNow; },
    get currentBlock() { return currentBlock; },
    get currentCharacter() { return currentCharacter; },
    get elapsedMs() { return elapsedMs; },
    get accuracy() { return accuracy; },
    get wpm() { return wpm; },
    get guideLevel() { return guideLevel; },
    get target() { return target; },
    get minutesLeft() { return minutesLeft; },
    startAdaptiveBlock,
    startTest,
    startLesson,
    nextBlock,
    setPrimaryTab,
    cycleGuide,
    previewKeyboardSound,
    togglePreference
  };
}

export type TypingController = ReturnType<typeof createTypingController>;
