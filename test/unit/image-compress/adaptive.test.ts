import { describe, expect, it } from 'vitest';
import { optimizeAdaptive } from '../../../src/lib/modules/image-compress/core/adaptive.ts';

function fakeEncode(d: { width: number; height: number }, quality: number): Promise<Blob> {
  const size = Math.max(1, Math.floor(d.width * d.height * (0.06 + quality * 0.08)));
  return Promise.resolve(new Blob([new Uint8Array(size)], { type: 'image/webp' }));
}

describe('adaptive image compression', () => {
  it('preserves original dimensions by default when too large', async () => {
    const result = await optimizeAdaptive({ width: 2000, height: 3000 }, fakeEncode, {
      targetBytes: 45_000, allowResize: false
    });
    expect(result.status).toBe('quality-limited');
    expect(result.resized).toBe(false);
    expect([result.width, result.height]).toEqual([2000, 3000]);
    expect(result.quality).toBeGreaterThanOrEqual(0.7);
  });

  it('only resizes with permission and stays at/below the target', async () => {
    const result = await optimizeAdaptive({ width: 2000, height: 3000 }, fakeEncode, {
      targetBytes: 45_000, allowResize: true, minimumShortSide: 480
    });
    expect(result.status).toBe('within-target');
    expect(result.resized).toBe(true);
    expect(result.blob.size).toBeLessThanOrEqual(45_000);
    expect(result.width).toBeLessThan(2000);
    expect(result.height / result.width).toBeCloseTo(1.5, 2);
  });

  it('does not resize when the original is already feasible', async () => {
    const result = await optimizeAdaptive({ width: 200, height: 300 }, fakeEncode, {
      targetBytes: 50_000, allowResize: true
    });
    expect(result.resized).toBe(false);
    expect(result.quality).toBe(1);
  });

  it('reports a still-unreachable target without ignoring minimum dimensions', async () => {
    const result = await optimizeAdaptive({ width: 2000, height: 3000 }, fakeEncode, {
      targetBytes: 500, allowResize: true, minimumShortSide: 640
    });
    expect(result.status).toBe('quality-limited');
    expect(Math.min(result.width, result.height)).toBeGreaterThanOrEqual(640);
    expect(result.blob.size).toBeGreaterThan(500);
  });

  it('rejects invalid dimension constraints', async () => {
    await expect(optimizeAdaptive({ width: 0, height: 30 }, fakeEncode,
      { targetBytes: 10_000, allowResize: true })).rejects.toThrow('Invalid source');
  });
});
