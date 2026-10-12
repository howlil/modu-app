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
    }, 54_000);
    expect(result.status).toBe('within-target');
    expect(result.blob.size).toBeLessThanOrEqual(54_000);
    expect(result.quality).toBeGreaterThan(0.49);
    expect(result.quality).toBeLessThanOrEqual(0.5);
    expect(result.attempts).toBe(calls);
    expect(result.attempts).toBeLessThanOrEqual(12);
  });

  it('reports an unreachable target instead of claiming success', async () => {
    const result = await findTargetSize(async (quality) => sizedBlob(80_000 + Math.floor(quality * 10_000)), 50_000);
    expect(result.status).toBe('over-target');
    expect(result.blob.size).toBe(80_000);
    expect(result.quality).toBe(0);
  });

  it('rejects invalid budgets and encoder failures', async () => {
    await expect(findTargetSize(async () => sizedBlob(100), -1)).rejects.toThrow();
    await expect(findTargetSize(async () => new Blob(), 1000)).rejects.toThrow('empty');
  });
});
