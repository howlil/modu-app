/** Pure typing-run decisions, independent of DOM, audio and learner adaptation. */
export function evaluateTypingInput(expected: string, typed: string, strictCorrection: boolean) {
  const correct = typed === expected;
  return { correct, advance: correct || !strictCorrection };
}

export function calculateTypingMetrics(
  typedIndex: number,
  attempts: number,
  errors: number,
  durationMs: number
) {
  return {
    accuracy: attempts > 0 ? Math.round(((attempts - errors) / attempts) * 100) : 100,
    wpm: durationMs > 0 ? Math.round((typedIndex / 5) / (durationMs / 60_000)) : 0
  };
}
