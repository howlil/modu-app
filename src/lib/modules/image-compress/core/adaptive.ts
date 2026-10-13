import { findTargetSize, MIN_ENCODER_QUALITY, type TargetSizeResult } from './target-size.ts';

export interface Dimensions { width: number; height: number }
export interface AdaptiveResult extends TargetSizeResult, Dimensions {
  resized: boolean;
}

export interface AdaptiveOptions {
  targetBytes: number;
  allowResize: boolean;
  minimumShortSide?: number;
  minimumQuality?: number;
  maximumQuality?: number;
  onAttempt?: (count: number) => void;
}

/** Optimize full resolution first; only resize from the original when explicitly allowed. */
export async function optimizeAdaptive(
  source: Dimensions,
  encode: (dimensions: Dimensions, quality: number) => Promise<Blob>,
  options: AdaptiveOptions
): Promise<AdaptiveResult> {
  if (!Number.isInteger(source.width) || !Number.isInteger(source.height) ||
      source.width < 1 || source.height < 1) throw new Error('Invalid source dimensions.');

  let attempts = 0;
  // Retain only the best candidate from each bounded search.
  // Never cache every encoded Blob: large inputs can exhaust browser memory.
  const measure = async (dimensions: Dimensions, quality: number): Promise<Blob> => {
    const blob = await encode(dimensions, quality);
    if (blob.size === 0) throw new Error('The encoder returned an empty image.');
    options.onAttempt?.(++attempts);
    return blob;
  };

  const run = (dimensions: Dimensions) => findTargetSize(
    (quality) => measure(dimensions, quality),
    options.targetBytes, undefined, options.minimumQuality ?? MIN_ENCODER_QUALITY, options.maximumQuality ?? 1
  );

  const original = await run(source);
  if (original.status === 'within-target' || !options.allowResize) {
    return { ...original, attempts, ...source, resized: false };
  }

  const minimumShortSide = options.minimumShortSide ?? 640;
  if (!Number.isInteger(minimumShortSide) || minimumShortSide < 1) {
    throw new Error('Invalid minimum resolution.');
  }
  const shortest = Math.min(source.width, source.height);
  if (shortest <= minimumShortSide) return { ...original, attempts, ...source, resized: false };

  const minScale = minimumShortSide / shortest;
  const dimensionsAt = (scale: number): Dimensions => ({
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale))
  });

  const smallest = dimensionsAt(minScale);
  const minBlob = await measure(smallest, options.minimumQuality ?? MIN_ENCODER_QUALITY);
  if (minBlob.size > options.targetBytes) {
    return {
      blob: minBlob, quality: options.minimumQuality ?? MIN_ENCODER_QUALITY,
      status: 'quality-limited', attempts,
      ...smallest, resized: true
    };
  }

  // Find largest scale that fits at our minimum quality setting.
  let low = minScale;
  let high = 1;
  let feasibleDimensions = smallest;
  for (let pass = 0; pass < 6 && high - low > 0.002; pass++) {
    const mid = (low + high) / 2;
    const dimensions = dimensionsAt(mid);
    const blob = await measure(dimensions, options.minimumQuality ?? MIN_ENCODER_QUALITY);
    if (blob.size <= options.targetBytes) {
      low = mid;
      feasibleDimensions = dimensions;
    } else {
      high = mid;
    }
  }

  // Optimize quality at the selected feasible dimensions.
  const best = await run(feasibleDimensions);
  return { ...best, attempts, ...feasibleDimensions, resized: true };
}
