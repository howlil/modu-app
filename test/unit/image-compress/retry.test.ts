import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createImageCompressController } from '../../../src/lib/modules/image-compress/controller/image-compress.svelte.ts';

const adapters = vi.hoisted(() => ({
  inspect: vi.fn(),
  encode: vi.fn()
}));
vi.mock('../../../src/lib/modules/image-compress/adapters/browser-encoder.ts', () => ({
  inspectImage: adapters.inspect,
  encodeImageToTarget: adapters.encode
}));

type Deferred = {
  promise: Promise<ReturnType<typeof makeResult>>;
  resolve: (value: ReturnType<typeof makeResult>) => void;
  reject: (reason: Error) => void;
};
function deferred(): Deferred {
  let resolve!: Deferred['resolve'];
  let reject!: Deferred['reject'];
  const promise = new Promise<ReturnType<typeof makeResult>>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function makeResult(status: 'within-target' | 'quality-limited', bytes = 251_000, resized = false) {
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: 'image/webp' }),
    quality: 0.7, status, attempts: 2, width: resized ? 800 : 3240,
    height: resized ? 1067 : 4320, format: 'image/webp' as const,
    resized, engine: 'wasm' as const
  };
}

let objectUrls: string[];
let revoked: string[];
beforeEach(() => {
  adapters.inspect.mockReset().mockResolvedValue({ width: 3240, height: 4320 });
  adapters.encode.mockReset();
  objectUrls = [];
  revoked = [];
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => {
      const url = 'blob:test-' + (objectUrls.length + 1);
      objectUrls.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => { revoked.push(url); })
  });
});
afterEach(() => vi.unstubAllGlobals());

async function limitedController() {
  const controller = createImageCompressController();
  const file = new File(['image'], 'wisuda.png', { type: 'image/png' });
  await controller.setFile(file);
  controller.setTargetInput('50');
  adapters.encode.mockResolvedValueOnce(makeResult('quality-limited'));
  await controller.compress();
  expect(controller.status).toBe('quality-limited');
  expect(controller.allowResize).toBe(false);
  return controller;
}

describe('image compressor one-click recovery', () => {
  it('retries once, keeps previous preview during processing, and swaps only on success', async () => {
    const controller = await limitedController();
    const previous = controller.output;
    const previousUrl = controller.outputUrl;
    const pending = deferred();
    adapters.encode.mockImplementationOnce(() => pending.promise);

    const retry = controller.recompressWithResize();
    expect(controller.status).toBe('processing');
    expect(controller.allowResize).toBe(true);
    expect(controller.output).toBe(previous);
    expect(controller.outputUrl).toBe(previousUrl);
    expect(revoked).not.toContain(previousUrl);
    await controller.recompressWithResize();
    expect(adapters.encode).toHaveBeenCalledTimes(2);
    expect(adapters.encode.mock.calls[1][5]).toBe(true);

    pending.resolve(makeResult('within-target', 49_500, true));
    await retry;
    expect(controller.status).toBe('complete');
    expect(controller.output?.blob.size).toBe(49_500);
    expect(controller.output?.resized).toBe(true);
    expect(revoked).toContain(previousUrl);
    expect(controller.outputUrl).not.toBe(previousUrl);
    controller.dispose();
  });

  it('retains the previous file and explains when resizing cannot meet the limit', async () => {
    const controller = await limitedController();
    const before = controller.output;
    const url = controller.outputUrl;
    adapters.encode.mockResolvedValueOnce(makeResult('quality-limited', 65_000, true));
    await controller.recompressWithResize();

    expect(controller.status).toBe('quality-limited');
    expect(controller.output).toBe(before);
    expect(controller.outputUrl).toBe(url);
    expect(controller.retryNotice).toContain('Previous result kept');
    expect(controller.allowResize).toBe(true);
    expect(revoked).not.toContain(url);
    controller.dispose();
  });

  it('retains previous result and surfaces a retry error instead of hiding it', async () => {
    const controller = await limitedController();
    const before = controller.output;
    const url = controller.outputUrl;
    adapters.encode.mockRejectedValueOnce(new Error('WASM encoder unavailable'));
    await controller.recompressWithResize();
    expect(controller.status).toBe('quality-limited');
    expect(controller.error).toContain('WASM encoder unavailable');
    expect(controller.output).toBe(before);
    expect(controller.outputUrl).toBe(url);
    controller.dispose();
  });

  it('discards an obsolete retry when the target changes, and does not resurrect old output', async () => {
    const controller = await limitedController();
    const pending = deferred();
    adapters.encode.mockImplementationOnce(() => pending.promise);
    const retry = controller.recompressWithResize();
    controller.setTargetInput('100');
    expect(controller.status).toBe('ready');
    expect(controller.output).toBeNull();
    pending.resolve(makeResult('within-target', 48_000, true));
    await retry;
    expect(controller.output).toBeNull();
    expect(controller.status).toBe('ready');
    controller.dispose();
  });

  it('cancels an active retry, keeps prior output, and ignores its late result', async () => {
    const controller = await limitedController();
    const previous = controller.output;
    const url = controller.outputUrl;
    const pending = deferred();
    adapters.encode.mockImplementationOnce(() => pending.promise);
    const active = controller.recompressWithResize();
    expect(controller.status).toBe('processing');
    controller.cancel();
    expect(controller.status).toBe('quality-limited');
    expect(controller.output).toBe(previous);
    expect(controller.outputUrl).toBe(url);
    pending.resolve(makeResult('within-target', 19_000, true));
    await active;
    expect(controller.output).toBe(previous);
    expect(controller.outputUrl).toBe(url);
    controller.dispose();
  });

  it('cancels a first compression and remains ready with no stale output', async () => {
    const controller = createImageCompressController();
    await controller.setFile(new File(['img'], 'x.png', { type: 'image/png' }));
    const pending = deferred();
    adapters.encode.mockImplementationOnce(() => pending.promise);
    const active = controller.compress();
    controller.cancel();
    expect(controller.status).toBe('ready');
    pending.resolve(makeResult('within-target', 18_000, false));
    await active;
    expect(controller.output).toBeNull();
    expect(controller.status).toBe('ready');
    controller.dispose();
  });

  it('M2 keeps the previous file when perceptual search finds no better candidate', async () => {
    const controller = createImageCompressController();
    await controller.setFile(new File(['img'], 'photo.png', { type: 'image/png' }));
    adapters.encode.mockResolvedValueOnce(makeResult('within-target', 49_000));
    await controller.compress();
    const existing = controller.output;
    adapters.encode.mockResolvedValueOnce({
      ...makeResult('within-target', 48_000),
      qualityEvidence: { metric: 'milo', rawError: 0.012, improved: false, scoredCandidates: 4, comparisonLongSide: 256 }
    });
    await controller.optimizeVisualQuality();
    expect(adapters.encode.mock.calls.at(-1)?.[6]).toBe('perceptual');
    expect(controller.output).toBe(existing);
    expect(controller.optimizationNotice).toContain('No better result');
    expect(controller.status).toBe('complete');
    controller.dispose();
  });

  it('M2 commits measured improvement only after valid output', async () => {
    const controller = createImageCompressController();
    await controller.setFile(new File(['img'], 'photo.png', { type: 'image/png' }));
    adapters.encode.mockResolvedValueOnce(makeResult('within-target', 49_000));
    await controller.compress();
    adapters.encode.mockResolvedValueOnce({
      ...makeResult('within-target', 48_000),
      qualityEvidence: { metric: 'milo', rawError: 0.006, improved: true, scoredCandidates: 3, comparisonLongSide: 256 }
    });
    await controller.optimizeVisualQuality();
    expect(controller.output?.blob.size).toBe(48_000);
    expect(controller.output?.qualityEvidence?.metric).toBe('milo');
    expect(controller.status).toBe('complete');
    controller.dispose();
  });

  it('M2 reports scorer failures without discarding downloadable prior result', async () => {
    const controller = createImageCompressController();
    await controller.setFile(new File(['img'], 'photo.png', { type: 'image/png' }));
    adapters.encode.mockResolvedValueOnce(makeResult('within-target', 49_000));
    await controller.compress();
    const previous = controller.output;
    adapters.encode.mockRejectedValueOnce(new Error('Perceptual scoring unavailable'));
    await controller.optimizeVisualQuality();
    expect(controller.error).toContain('Perceptual scoring unavailable');
    expect(controller.output).toBe(previous);
    expect(controller.status).toBe('complete');
    controller.dispose();
  });

  it('refuses recovery unless a prior quality-limited result exists', async () => {
    const controller = createImageCompressController();
    await controller.recompressWithResize();
    expect(adapters.encode).not.toHaveBeenCalled();
    controller.dispose();
  });
});
