export type ImageOutputFormat = 'image/jpeg' | 'image/webp';

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
  return input * 1024;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * M1 rate control: highest encoder quality known to fit the byte budget.
 * A quality parameter is not a perceptual score. Caller validates MIME/dimensions.
 */
export async function findTargetSize(
  encode: (quality: number) => Promise<Blob>,
  targetBytes: number,
  onAttempt?: (attempts: number) => void,
  minimumQuality = MIN_ENCODER_QUALITY
): Promise<TargetSizeResult> {
  if (!Number.isSafeInteger(targetBytes) || targetBytes <= 0) {
    throw new Error('Invalid target size.');
  }

  if (!Number.isFinite(minimumQuality) || minimumQuality <= 0 || minimumQuality > 1) {
    throw new Error('Invalid minimum encoder quality.');
  }

  let attempts = 0;
  async function measure(quality: number): Promise<EncodingCandidate> {
    const blob = await encode(quality);
    if (blob.size === 0) throw new Error('Image encoder returned an empty file.');
    attempts += 1;
    onAttempt?.(attempts);
    return { blob, quality };
  }

  const highest = await measure(1);
  if (highest.blob.size <= targetBytes) {
    return { ...highest, attempts, status: 'within-target' };
  }

  let best = await measure(minimumQuality);
  if (best.blob.size > targetBytes) {
    return { ...best, attempts, status: 'quality-limited' };
  }

  let low = minimumQuality;
  let high = 1;

  for (let pass = 0; pass < 10 && high - low > 0.001; pass++) {
    const quality = (low + high) / 2;
    const candidate = await measure(quality);
    if (candidate.blob.size <= targetBytes) {
      if (candidate.quality > best.quality) best = candidate;
      low = quality;
    } else {
      high = quality;
    }
  }

  return { ...best, attempts, status: 'within-target' };
}
