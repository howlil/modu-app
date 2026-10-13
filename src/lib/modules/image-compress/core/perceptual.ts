import type { Dimensions } from './adaptive.ts';

export interface PerceptualCandidate extends Dimensions {
  quality: number;
  blob: Blob;
  error: number;
}
export type CandidatePlan = Array<Dimensions & { quality: number }>;
export interface PerceptualSearchOptions {
  source: Dimensions;
  baseline: Dimensions & { quality: number };
  allowResize: boolean;
  minShortSide?: number;
  maxCandidates?: number;
}
/** Stable bounded neighbor search; source dimensions remain authoritative. */
export function planPerceptualCandidates(options: PerceptualSearchOptions): CandidatePlan {
  const { source, baseline, allowResize, minShortSide = 640 } = options;
  const cap = Math.min(8, Math.max(0, Math.trunc(options.maxCandidates ?? 4)));
  if (!Number.isFinite(source.width) || !Number.isFinite(source.height) ||
      source.width < 1 || source.height < 1) throw new Error('Invalid source dimensions.');
  const candidates: CandidatePlan = [];
  const seen = new Set<string>();
  const add = (scale: number, quality: number) => {
    if (candidates.length >= cap) return;
    const width = allowResize ? Math.round(baseline.width * scale) : source.width;
    const height = allowResize ? Math.round(baseline.height * scale) : source.height;
    if (width < 1 || height < 1 || width > source.width || height > source.height ||
      Math.min(width, height) < Math.min(minShortSide, Math.min(source.width, source.height))) return;
    const q = Math.max(30, Math.min(100, Math.round(quality * 100)));
    const key = `${width}x${height}@${q}`;
    if (seen.has(key) || (width === baseline.width && height === baseline.height &&
       q === Math.round(baseline.quality * 100))) return;
    seen.add(key);
    candidates.push({ width, height, quality: q / 100 });
  };
  add(1, baseline.quality - 0.08);
  add(1, baseline.quality + 0.08);
  if (allowResize) {
    add(0.9, baseline.quality + 0.12);
    add(0.8, baseline.quality + 0.18);
    add(1.06, baseline.quality - 0.10);
    add(0.95, baseline.quality);
  } else {
    add(1, baseline.quality - 0.15);
    add(1, baseline.quality + 0.15);
  }
  return candidates.slice(0, cap);
}
export function isBetterPerceptualCandidate(
  next: PerceptualCandidate,
  current: PerceptualCandidate,
  targetBytes: number
): boolean {
  if (next.blob.size === 0 || next.blob.size > targetBytes ||
      !Number.isFinite(next.error) || next.error < 0) return false;
  if (current.blob.size > targetBytes || !Number.isFinite(current.error)) return true;
  // MILO rawError: lower is better. Ignore noise-level differences.
  const margin = Math.max(0.00001, current.error * 0.02);
  if (next.error < current.error - margin) return true;
  if (Math.abs(next.error - current.error) <= margin) {
    const nextPixels = next.width * next.height;
    const currentPixels = current.width * current.height;
    if (nextPixels > currentPixels * 1.05) return true;
    if (Math.abs(nextPixels - currentPixels) <= currentPixels * 0.05 &&
        next.blob.size < current.blob.size * 0.92) return true;
  }
  return false;
}
