import type { PracticeAttempt, RecallRating } from './learning.ts';

/** A rating is a learner's self-report, not an externally graded translation. */
export interface RecallAssessment {
  readonly version: 1;
  readonly source: 'self_rating';
  readonly outcome: 'forgot' | 'recalled';
  readonly effort: 'high' | 'normal' | 'low' | null;
}

const feedback = {
  again: 'Not recalled. Review this sentence again.',
  hard: 'Recalled with difficulty.',
  good: 'Recalled with normal effort.',
  easy: 'Recalled easily.'
} as const satisfies Record<RecallRating, string>;

export function assessRecallRating(rating: RecallRating): RecallAssessment {
  switch (rating) {
    case 'again': return { version: 1, source: 'self_rating', outcome: 'forgot', effort: null };
    case 'hard': return { version: 1, source: 'self_rating', outcome: 'recalled', effort: 'high' };
    case 'good': return { version: 1, source: 'self_rating', outcome: 'recalled', effort: 'normal' };
    case 'easy': return { version: 1, source: 'self_rating', outcome: 'recalled', effort: 'low' };
  }
}

export function recallFeedback(rating: RecallRating): string {
  return feedback[rating];
}

/** Old M0/M1 attempts have no assessment; they retain their original meaning. */
export function assessmentForAttempt(attempt: PracticeAttempt): RecallAssessment | null {
  return attempt.evidence.kind === 'recall'
    ? attempt.evidence.assessment ?? assessRecallRating(attempt.evidence.rating)
    : null;
}

/** Validate persisted evidence, never trust an arbitrary client-supplied assessment. */
export function isValidRecallAssessment(value: unknown, rating: RecallRating): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const expected = assessRecallRating(rating);
  return v.version === expected.version && v.source === expected.source &&
    v.outcome === expected.outcome && v.effort === expected.effort;
}

export type AnswerCheckStatus = 'empty' | 'reference_match' | 'variant_match' | 'needs_review';
export interface AnswerCheck {
  readonly version: 1;
  readonly method: 'literal_comparison';
  readonly status: AnswerCheckStatus;
  readonly feedback: string;
}

/** Literal feedback only, intentionally not a grade/CEFR score or SRS input.
 * Language equivalents outside supplied accepted variants may still be correct. */
export function checkRecallAnswer(input: {
  response: string;
  reference: string;
  acceptedVariants?: readonly string[];
}): AnswerCheck {
  const normalize = (text: string) => text.normalize('NFC').trim()
    .replace(/\s+/gu, ' ').replace(/[.。]+$/gu, '').trim();
  const answer = normalize(input.response);
  const reference = normalize(input.reference);
  if (!reference || input.reference.length > 2000 ||
    input.response.length > 2000 ||
    (input.acceptedVariants?.length ?? 0) > 30 ||
    input.acceptedVariants?.some(v => !v.trim() || v.length > 2000)) {
    throw new RangeError('Invalid or oversized recall comparison input.');
  }
  if (!answer) return {
    version: 1, method: 'literal_comparison', status: 'empty',
    feedback: 'No written answer. Compare the reference and rate your recall yourself.'
  };
  if (answer === reference) return {
    version: 1, method: 'literal_comparison', status: 'reference_match',
    feedback: 'Your text matches the reference sentence.'
  };
  if (input.acceptedVariants?.some(v => normalize(v) === answer)) return {
    version: 1, method: 'literal_comparison', status: 'variant_match',
    feedback: 'Your text matches an accepted alternative.'
  };
  return {
    version: 1, method: 'literal_comparison', status: 'needs_review',
    feedback: 'Your wording differs from the reference. It may still be valid; review it before rating.'
  };
}
