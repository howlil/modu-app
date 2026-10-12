import { describe, expect, it } from 'vitest';
import { findTargetSize, targetBytesFromKB, formatBytes } from '../../../src/lib/modules/image-compress/core/target-size.ts';

const sizedBlob = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: 'image/webp' });

describe('image target-size controller', () => {
  it('validates custom targets and uses binary KB', () => {
    expect(targetBytesFromKB(200)).toBe(204800);
    expect(() => targetBytesFromKB(0)).toThrow();
    expect(() => targetBytesFromKB(20.5)).toThrow();
    expect(() => targetBytesFromKB(30000)).toThrow();
    expect(formatBytes(204800)).toBe('200.0 KB');
  });

  it('keeps full quality when it already meets the budget', async () => {
    const result = await findTargetSize(async () => sizedBlob(10_000), 20_000);
    expect(result.status).toBe('within-target');
    expect(result.quality).toBe(1);
    expect(result.attempts).toBe(1);
  });

  it('finds a high quality that never exceeds the byte budget', async () => {
    let calls = 0;
    const result = await findTargetSize(async (quality) => {
      calls++;
      return sizedBlob(4_000 + Math.floor(quality * 100_000));
    }, 84_000);
    expect(result.status).toBe('within-target');
    expect(result.blob.size).toBeLessThanOrEqual(84_000);
    expect(result.quality).toBeGreaterThan(0.79);
    expect(result.quality).toBeLessThanOrEqual(0.8);
    expect(result.attempts).toBe(calls);
    expect(result.attempts).toBeLessThanOrEqual(12);
  });

  it('never drops below the quality safeguard for unreachable targets', async () => {
    const tried: number[] = [];
    const result = await findTargetSize(async (quality) => {
      tried.push(quality);
      return sizedBlob(80_000 + Math.floor(quality * 10_000));
    }, 50_000);
    expect(result.status).toBe('quality-limited');
    expect(result.blob.size).toBe(87_000);
    expect(result.quality).toBe(0.7);
    expect(tried.every((quality) => quality >= 0.7)).toBe(true);
  });

  it('supports a stricter custom quality safeguard', async () => {
    const result = await findTargetSize(
      async (quality) => sizedBlob(10_000 + Math.floor(quality * 100_000)),
      80_000, undefined, 0.8
    );
    expect(result.status).toBe('quality-limited');
    expect(result.quality).toBe(0.8);
  });

  it('rejects invalid budgets and encoder failures', async () => {
    await expect(findTargetSize(async () => sizedBlob(100), -1)).rejects.toThrow();
    await expect(findTargetSize(async () => new Blob(), 1000)).rejects.toThrow('empty');
  });
});
