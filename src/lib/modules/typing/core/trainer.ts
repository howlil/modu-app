export type TrainingBlockKind = 'warmup' | 'weak' | 'bigram' | 'transfer' | 'benchmark';

export type TypingPreferences = {
  masteryAccuracy: number;
  minSamples: number;
  masteryLatency: number;
  strictCorrection: boolean;
  automaticGuideFading: boolean;
  oppositeHandShift: boolean;
  keyboardSound: boolean;
};

export type KeyStat = {
  attempts: number;
  correct: number;
  errors: number;
  totalLatency: number;
  latencySamples: number;
  recent: number[];
  lastSeen: number;
};

export type TransitionStat = {
  attempts: number;
  correct: number;
  errors: number;
  totalLatency: number;
  latencySamples: number;
};

export type RetentionItem = {
  level: number;
  nextReview: number;
  lastPass: number;
};

export type TypingSessionSummary = {
  at: number;
  kind: TrainingBlockKind | 'test';
  wpm: number;
  accuracy: number;
  errors: number;
  durationMs: number;
};

export type TypingLearningState = {
  keyStats: Record<string, KeyStat>;
  transitionStats: Record<string, TransitionStat>;
  retention: Record<string, RetentionItem>;
  sessions: TypingSessionSummary[];
};

export type KeyMetric = {
  key: string;
  samples: number;
  accuracy: number | null;
  latency: number | null;
  weakness: number;
  mastered: boolean;
  status: 'none' | 'learning' | 'weak' | 'mastered';
};

export type TransitionMetric = {
  pair: string;
  samples: number;
  accuracy: number;
  latency: number | null;
  weakness: number;
};

export const DEFAULT_TYPING_PREFERENCES: TypingPreferences = {
  masteryAccuracy: 98,
  minSamples: 20,
  masteryLatency: 420,
  strictCorrection: true,
  automaticGuideFading: true,
  oppositeHandShift: true,
  keyboardSound: true
};

export const KEY_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
  [' ']
] as const;

export const FINGER_MAP: Record<string, string> = {
  q: 'Left pinky',
  a: 'Left pinky',
  z: 'Left pinky',
  w: 'Left ring',
  s: 'Left ring',
  x: 'Left ring',
  e: 'Left middle',
  d: 'Left middle',
  c: 'Left middle',
  r: 'Left index',
  t: 'Left index',
  f: 'Left index',
  g: 'Left index',
  v: 'Left index',
  b: 'Left index',
  y: 'Right index',
  u: 'Right index',
  h: 'Right index',
  j: 'Right index',
  n: 'Right index',
  m: 'Right index',
  i: 'Right middle',
  k: 'Right middle',
  ',': 'Right middle',
  o: 'Right ring',
  l: 'Right ring',
  '.': 'Right ring',
  p: 'Right pinky',
  ';': 'Right pinky',
  "'": 'Right pinky',
  '/': 'Right pinky',
  ' ': 'Thumb'
};

export const TRAINING_BLOCKS: Array<{
  kind: TrainingBlockKind;
  name: string;
  shortName: string;
  minutes: number;
  description: string;
}> = [
  {
    kind: 'warmup',
    name: 'Warm-up / retention',
    shortName: 'Warm-up',
    minutes: 2,
    description: 'Re-activate mastered keys and anything due for review.'
  },
  {
    kind: 'weak',
    name: 'Weak keys',
    shortName: 'Weak keys',
    minutes: 3,
    description: 'Concentrated practice on your least stable keys.'
  },
  {
    kind: 'bigram',
    name: 'Weak transitions',
    shortName: 'Transitions',
    minutes: 3,
    description: 'Train slow or error-prone key transitions in real words.'
  },
  {
    kind: 'transfer',
    name: 'Mixed transfer',
    shortName: 'Transfer',
    minutes: 3,
    description: 'Move weak patterns into normal words and mixed context.'
  },
  {
    kind: 'benchmark',
    name: 'Benchmark',
    shortName: 'Benchmark',
    minutes: 1,
    description: 'Use unseen text to measure transfer without drill memorization.'
  }
];

export const LESSONS = [
  ['Home Row Anchors', 'ASDF JKL; mapping and return-to-home discipline.'],
  ['Index Finger Reach', 'R T F G V B / Y U H J N M.'],
  ['Top Row', 'QWERTYUIOP without shifting the whole hand.'],
  ['Bottom Row', 'ZXCVBNM reach and recovery.'],
  ['Hand Alternation', 'Stable left-right rhythm.'],
  ['Engineering Words', 'Common technical word patterns.'],
  ['Punctuation', "Comma, period, slash, semicolon, apostrophe."],
  ['Shift & Capitalization', 'Opposite-hand Shift coordination.'],
  ['Numbers & Symbols', 'Number row and shifted symbols.'],
  ['Developer Patterns', 'Brackets, operators, and common code transitions.']
] as const;

export const LESSON_DRILLS = [
  "asdf jkl; fj dk sl a; asdf jkl; fdsa ;lkj asdf jkl; fj dk sl",
  "rtfg vb rtf gvb yuhj nm yu hj nm rtfg yuhj fj gh vb nm",
  "qwer tyui op qwerty uiop qwe rty uiop qwerty top row",
  "zxcv bnm zxcv bnm cvbn xz zxcv bnm zxcv bnm",
  "asdf jkl; fj dk sl a; jkl asdf f j d k a ; s l",
  "code data build test server client request response backend async",
  ", . / ; ' , . / ; ' end. test, code / file; it's done.",
  "Hello World Type This Keep Focus Shift Practice Upper Lower",
  "12345 67890 1024 2048 512 16 32 64 ! @ # $ % ^ & *",
  "if (data) { return value; } arr[index] => value === true;"
] as const;

export const TEST_TEXT =
  'clean systems are easier to change when state transitions remain explicit and predictable';

const WORDS = [
  'data',
  'flow',
  'code',
  'type',
  'build',
  'test',
  'logic',
  'model',
  'system',
  'server',
  'client',
  'input',
  'output',
  'cache',
  'queue',
  'worker',
  'thread',
  'object',
  'method',
  'service',
  'request',
  'response',
  'database',
  'function',
  'variable',
  'runtime',
  'network',
  'packet',
  'socket',
  'memory',
  'process',
  'query',
  'index',
  'commit',
  'branch',
  'merge',
  'deploy',
  'cloud',
  'container',
  'schema',
  'transaction',
  'retry',
  'timeout',
  'buffer',
  'stream',
  'event',
  'state',
  'async',
  'promise',
  'public',
  'private',
  'quiet',
  'quick',
  'probe',
  'problem',
  'binary',
  'backend',
  'frontend',
  'typing',
  'practice',
  'finger',
  'anchor',
  'return',
  'movement',
  'stable',
  'learn',
  'master',
  'speed',
  'accuracy',
  'quality',
  'write',
  'read',
  'trace',
  'debug',
  'route',
  'power',
  'upper',
  'lower',
  'jump',
  'calm',
  'clean',
  'repeat',
  'release',
  'review',
  'design'
];

const BENCHMARKS = [
  'reliable systems recover from partial failures without hiding state',
  'clear interfaces make correct behavior easier to discover and repeat',
  'small consistent movements create speed without sacrificing accuracy'
];

const SHIFTED_TO_BASE: Record<string, string> = {
  '!': '1',
  '@': '2',
  '#': '3',
  '$': '4',
  '%': '5',
  '^': '6',
  '&': '7',
  '*': '8',
  '(': '9',
  ')': '0',
  '_': '-',
  '+': '=',
  '{': '[',
  '}': ']',
  ':': ';',
  '"': "'",
  '<': ',',
  '>': '.',
  '?': '/',
  '|': '\\',
  '~': '`'
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function createInitialTypingState(): TypingLearningState {
  return {
    keyStats: {},
    transitionStats: {},
    retention: {},
    sessions: []
  };
}

export function baseKey(character: string) {
  if (character === ' ') return ' ';
  return SHIFTED_TO_BASE[character] ?? character.toLowerCase();
}

export function fingerFor(character: string) {
  return FINGER_MAP[baseKey(character)] ?? 'Mapped finger';
}

function keyStat(state: TypingLearningState, key: string) {
  return (
    state.keyStats[key] ??
    (state.keyStats[key] = {
      attempts: 0,
      correct: 0,
      errors: 0,
      totalLatency: 0,
      latencySamples: 0,
      recent: [],
      lastSeen: 0
    })
  );
}

function transitionStat(state: TypingLearningState, pair: string) {
  return (
    state.transitionStats[pair] ??
    (state.transitionStats[pair] = {
      attempts: 0,
      correct: 0,
      errors: 0,
      totalLatency: 0,
      latencySamples: 0
    })
  );
}

export function recordTypingAttempt(
  state: TypingLearningState,
  expected: string,
  correct: boolean,
  latencyMs: number | null,
  previousExpected: string | null
) {
  const key = baseKey(expected);
  const stat = keyStat(state, key);

  stat.attempts += 1;
  stat.lastSeen = Date.now();

  if (correct) stat.correct += 1;
  else stat.errors += 1;

  if (correct && latencyMs !== null && latencyMs > 0 && latencyMs < 2500) {
    stat.totalLatency += latencyMs;
    stat.latencySamples += 1;
  }

  stat.recent.push(correct ? 1 : 0);
  if (stat.recent.length > 30) stat.recent.shift();

  if (previousExpected) {
    const pair = baseKey(previousExpected) + key;
    const transition = transitionStat(state, pair);
    transition.attempts += 1;

    if (correct) transition.correct += 1;
    else transition.errors += 1;

    if (correct && latencyMs !== null && latencyMs > 0 && latencyMs < 2500) {
      transition.totalLatency += latencyMs;
      transition.latencySamples += 1;
    }
  }
}

export function keyMetric(
  state: TypingLearningState,
  key: string,
  preferences: TypingPreferences
): KeyMetric {
  const stat = state.keyStats[key];

  if (!stat || stat.attempts === 0) {
    return {
      key,
      samples: 0,
      accuracy: null,
      latency: null,
      weakness: 0,
      mastered: false,
      status: 'none'
    };
  }

  const accuracy = (stat.correct / stat.attempts) * 100;
  const latency =
    stat.latencySamples > 0 ? stat.totalLatency / stat.latencySamples : null;
  const recentAccuracy =
    stat.recent.length > 0
      ? (stat.recent.reduce((total, value) => total + value, 0) / stat.recent.length) * 100
      : accuracy;

  const weakness =
    0.5 * clamp((100 - accuracy) / 15, 0, 1) +
    0.3 * (latency === null ? 0 : clamp((latency - 140) / 500, 0, 1)) +
    0.2 * clamp((accuracy - recentAccuracy) / 15, 0, 1);

  const mastered =
    stat.attempts >= preferences.minSamples &&
    accuracy >= preferences.masteryAccuracy &&
    (latency === null || latency <= preferences.masteryLatency);

  return {
    key,
    samples: stat.attempts,
    accuracy,
    latency,
    weakness,
    mastered,
    status: mastered
      ? 'mastered'
      : stat.attempts >= Math.max(8, preferences.minSamples / 2) && weakness > 0.2
        ? 'weak'
        : 'learning'
  };
}

export function weakKeys(
  state: TypingLearningState,
  preferences: TypingPreferences,
  limit = 5
) {
  return Object.keys(state.keyStats)
    .map((key) => keyMetric(state, key, preferences))
    .filter((metric) => metric.samples >= 5 && !metric.mastered)
    .sort((a, b) => b.weakness - a.weakness)
    .slice(0, limit);
}

export function weakTransitions(state: TypingLearningState, limit = 5) {
  return Object.entries(state.transitionStats)
    .filter(([, stat]) => stat.attempts >= 4)
    .map(([pair, stat]): TransitionMetric => {
      const accuracy = (stat.correct / stat.attempts) * 100;
      const latency =
        stat.latencySamples > 0 ? stat.totalLatency / stat.latencySamples : null;
      const weakness =
        0.6 * clamp((100 - accuracy) / 18, 0, 1) +
        0.4 * (latency === null ? 0 : clamp((latency - 130) / 520, 0, 1));

      return {
        pair,
        samples: stat.attempts,
        accuracy,
        latency,
        weakness
      };
    })
    .sort((a, b) => b.weakness - a.weakness)
    .slice(0, limit);
}

export function masteredKeys(
  state: TypingLearningState,
  preferences: TypingPreferences
) {
  return Object.keys(state.keyStats).filter(
    (key) => keyMetric(state, key, preferences).mastered
  );
}

export function dueKeys(state: TypingLearningState, now = Date.now()) {
  return Object.entries(state.retention)
    .filter(([, item]) => item.nextReview <= now)
    .map(([key]) => key);
}

export function syncRetention(
  state: TypingLearningState,
  preferences: TypingPreferences,
  now = Date.now()
) {
  for (const key of Object.keys(state.keyStats)) {
    if (
      keyMetric(state, key, preferences).mastered &&
      state.retention[key] === undefined
    ) {
      state.retention[key] = {
        level: 0,
        nextReview: now + 86_400_000,
        lastPass: now
      };
    }
  }
}

export function markRetention(
  state: TypingLearningState,
  keys: string[],
  passed: boolean,
  now = Date.now()
) {
  const intervals = [1, 3, 7, 14, 30];

  for (const key of keys) {
    const item =
      state.retention[key] ??
      (state.retention[key] = {
        level: 0,
        nextReview: now,
        lastPass: 0
      });

    if (passed) {
      item.level = Math.min(item.level + 1, intervals.length - 1);
      item.lastPass = now;
      item.nextReview = now + intervals[item.level] * 86_400_000;
    } else {
      item.level = 0;
      item.nextReview = now + 86_400_000;
    }
  }
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function wordsFor(keys: string[], pairs: string[], count: number) {
  let candidates = WORDS.filter(
    (word) =>
      keys.some((key) => word.includes(key)) ||
      pairs.some((pair) => word.includes(pair))
  );

  if (candidates.length < 6) candidates = [...candidates, ...WORDS];

  const scored = unique(candidates)
    .map((word) => ({
      word,
      score:
        keys.reduce(
          (total, key) => total + (word.split(key).length - 1),
          0
        ) +
        pairs.reduce(
          (total, pair) => total + 2 * (word.split(pair).length - 1),
          0
        )
    }))
    .sort((a, b) => b.score - a.score);

  const pool = scored.slice(0, Math.min(scored.length, 20));
  return Array.from({ length: count }, (_, index) => pool[index % pool.length].word).join(
    ' '
  );
}

function isolate(keys: string[], pairs: string[]) {
  const keyDrills = keys.slice(0, 4).map((key) => {
    const anchor = FINGER_MAP[key]?.startsWith('Left') ? 'f' : 'j';
    return `${key}${anchor}${key} ${key}${anchor}${key}`;
  });

  const pairDrills = pairs.slice(0, 3).map((pair) => `${pair} ${pair} ${pair}`);
  return [...keyDrills, ...pairDrills].join(' ');
}

export function generateBlockText(
  kind: TrainingBlockKind,
  state: TypingLearningState,
  preferences: TypingPreferences
) {
  const weakKeyList = weakKeys(state, preferences, 4).map((metric) => metric.key);
  const weakPairList = weakTransitions(state, 4).map((metric) => metric.pair);
  const due = dueKeys(state).slice(0, 5);

  if (kind === 'warmup') {
    if (due.length > 0) return wordsFor(due, [], 14);

    const mastered = masteredKeys(state, preferences);
    if (mastered.length >= 5) return wordsFor(mastered.slice(0, 8), [], 14);

    return 'asdf jkl; asdf jkl; fj fj dk dk sl sl a; a; asdf jkl; fdsa ;lkj';
  }

  if (kind === 'weak') {
    if (weakKeyList.length === 0) {
      return 'qwer uiop qwerty uiop write type quiet power route tower query upper';
    }

    return `${isolate(weakKeyList, weakPairList)} ${wordsFor(
      weakKeyList,
      weakPairList,
      14
    )}`;
  }

  if (kind === 'bigram') {
    if (weakPairList.length === 0) {
      return 'data flow code type build test logic model system server client input output';
    }

    return `${isolate([], weakPairList)} ${wordsFor(
      weakKeyList,
      weakPairList,
      16
    )}`;
  }

  if (kind === 'transfer') {
    return wordsFor(weakKeyList, weakPairList, 24);
  }

  return BENCHMARKS[state.sessions.length % BENCHMARKS.length];
}

export function targetLabel(
  kind: TrainingBlockKind,
  state: TypingLearningState,
  preferences: TypingPreferences
) {
  if (kind === 'warmup') {
    const due = dueKeys(state).slice(0, 4);
    return due.length > 0 ? due.map((key) => key.toUpperCase()).join(' · ') : 'Retention';
  }

  if (kind === 'weak') {
    const keys = weakKeys(state, preferences, 4);
    return keys.length > 0
      ? keys.map((metric) => metric.key.toUpperCase()).join(' · ')
      : 'Baseline';
  }

  if (kind === 'bigram') {
    const pairs = weakTransitions(state, 4);
    return pairs.length > 0
      ? pairs.map((metric) => metric.pair.toUpperCase()).join(' · ')
      : 'Transitions';
  }

  if (kind === 'transfer') return 'Mixed';
  return 'Benchmark';
}

export function recommendedGuideLevel(
  text: string,
  state: TypingLearningState,
  preferences: TypingPreferences
) {
  if (!preferences.automaticGuideFading) return 0;

  const keys = unique(
    [...text]
      .map(baseKey)
      .filter((key) => key !== ' ' && FINGER_MAP[key] !== undefined)
  );

  const metrics = keys
    .map((key) => keyMetric(state, key, preferences))
    .filter((metric) => metric.samples > 0);

  if (metrics.length === 0) return 0;

  const masteryRatio =
    metrics.filter((metric) => metric.mastered).length / metrics.length;
  const accuracy =
    metrics.reduce((total, metric) => total + (metric.accuracy ?? 0), 0) /
    metrics.length;

  if (masteryRatio > 0.85 && accuracy >= 98) return 2;
  if (masteryRatio > 0.55 && accuracy >= 96) return 1;
  return 0;
}
