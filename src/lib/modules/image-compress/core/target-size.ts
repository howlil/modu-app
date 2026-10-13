export type ImageOutputFormat = 'image/jpeg' | 'image/webp' | 'image/avif';

// A conservative encoder-parameter guardrail; NOT a validated visual quality metric.
// Never use quality=0 as an automatic fallback for an impossible byte budget.
export const MIN_ENCODER_QUALITY = 0.7;
export const MIN_TARGET_KB = 10;
export const MAX_TARGET_KB = 20_480;
export const MAX_INPUT_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;

export interface EncodingCandidate {
  blob: Blob;
  quality: number;
}

export interface TargetSizeResult extends EncodingCandidate {
  status: 'within-target' | 'quality-limited';
  attempts: number;
}

export function targetBytesFromKB(input: number): number {
  if (!Number.isInteger(input) || input < MIN_TARGET_KB || input > MAX_TARGET_KB) {
    throw new Error('Enter a target from 10 KB to 20,480 KB.');
  }
  return input * 1000;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return bytes + ' B';
  if (bytes < 1_000_000) return (bytes / 1000).toFixed(1) + ' KB';
  return (bytes / 1_000_000).toFixed(2) + ' MB';
}

/**
 * M1 rate control: highest encoder quality known to fit the byte budget.
 * A quality parameter is not a perceptual score. Caller validates MIME/dimensions.
 */
export async function findTargetSize(
  encode: (quality: number) => Promise<Blob>,
  targetBytes: number,
  onAttempt?: (attempts: number) => void,
  minimumQuality = MIN_ENCODER_QUALITY,
  maximumQuality = 1
): Promise<TargetSizeResult> {
  if (!Number.isSafeInteger(targetBytes) || targetBytes <= 0) {
    throw new Error('Invalid target size.');
  }

  if (!Number.isFinite(minimumQuality) || minimumQuality <= 0 || minimumQuality > 1) {
    throw new Error('Invalid minimum encoder quality.');
  }

  if (!Number.isFinite(maximumQuality) || maximumQuality > 1 || maximumQuality <= minimumQuality) throw new Error('Invalid maximum quality.');
  let attempts = 0;
  async function measure(quality: number): Promise<EncodingCandidate> {
    const blob = await encode(quality);
    if (blob.size === 0) throw new Error('Image encoder returned an empty file.');
    attempts += 1;
    onAttempt?.(attempts);
    return { blob, quality };
  }

  const highest = await measure(maximumQuality);
  if (highest.blob.size <= targetBytes) {
    return { ...highest, attempts, status: 'within-target' };
  }

  let best = await measure(minimumQuality);
  if (best.blob.size > targetBytes) {
    return { ...best, attempts, status: 'quality-limited' };
  }

  // Encoder bindings quantize quality to integer values; search that domain
  // so we do not encode the same rounded setting repeatedly.
  let low = Math.ceil(minimumQuality * 100);
  let high = Math.round(maximumQuality * 100);
  let bestLevel = low;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    const candidate = await measure(mid / 100);
    if (candidate.blob.size <= targetBytes) {
      low = mid;
      if (mid > bestLevel) { best = candidate; bestLevel = mid; }
    } else high = mid;
  }
  // Verify the adjacent upper neighborhood. Actual byte sizes need not be
  // strictly monotonic across adjacent quality levels.
  for (let q = bestLevel + 1; q <= Math.min(Math.round(maximumQuality * 100), bestLevel + 2); q++) {
    const candidate = await measure(q / 100);
    if (candidate.blob.size <= targetBytes) {
      best = candidate;
      bestLevel = q;
    }
  }

  return { ...best, attempts, status: 'within-target' };
}
