/// <reference lib="webworker" />
import createPica from 'pica';
import { optimizeAdaptive, type Dimensions } from '../core/adaptive.ts';
import { planPerceptualCandidates, isBetterPerceptualCandidate } from '../core/perceptual.ts';
import type { ImageOutputFormat } from '../core/target-size.ts';

interface Request {
  file: File;
  format: ImageOutputFormat;
  targetBytes: number;
  allowResize: boolean;
  mode?: 'standard' | 'perceptual';
}

const scope = self as DedicatedWorkerGlobalScope;
scope.onmessage = async (event: MessageEvent<Request>) => {
  let bitmap: ImageBitmap | undefined;
  let originalCanvas: OffscreenCanvas | undefined;
  try {
    const { file, format, targetBytes, allowResize, mode = 'standard' } = event.data;
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const source = { width: bitmap.width, height: bitmap.height };
    const resizer = createPica({ features: ['js', 'wasm'], concurrency: 1 });
    const sourceCanvas = new OffscreenCanvas(source.width, source.height);
    originalCanvas = sourceCanvas;
    const originalContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!originalContext) throw new Error('Canvas initialization failed.');
    originalContext.drawImage(bitmap, 0, 0);

    let usedBrowserFallback = false;
    let currentPixels: ImageData | undefined;
    let currentKey = '';
    const pixelsAt = async (dimensions: Dimensions): Promise<ImageData> => {
      const key = dimensions.width + 'x' + dimensions.height;
      if (key === currentKey && currentPixels) return currentPixels;
      if (key === source.width + 'x' + source.height) {
        currentPixels = originalContext.getImageData(0, 0, source.width, source.height);
      } else {
        const scaledCanvas = new OffscreenCanvas(dimensions.width, dimensions.height);
        await resizer.resize(sourceCanvas, scaledCanvas, { filter: 'mks2013' });
        const ctx = scaledCanvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Unable to read the resized image.');
        currentPixels = ctx.getImageData(0, 0, dimensions.width, dimensions.height);
        scaledCanvas.width = 0;
        scaledCanvas.height = 0;
      }
      currentKey = key;
      return currentPixels;
    };

    const encode = async (dimensions: Dimensions, quality: number): Promise<Blob> => {
      const pixels = await pixelsAt(dimensions);
      let bytes: ArrayBuffer | Uint8Array | null;
      if (format === 'image/webp') {
        try {
          const { encodeRGBA } = await import('wasm-webp');
          const raw = await encodeRGBA(
            new Uint8Array(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength),
            dimensions.width, dimensions.height, Math.round(quality * 100)
          );
          if (!raw) throw new Error('WebP WASM encoder returned no data.');
          bytes = new Uint8Array(raw);
        } catch {
          usedBrowserFallback = true;
          const canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('No fallback WebP encoder available.');
          ctx.putImageData(pixels, 0, 0);
          const fallback = await canvas.convertToBlob({ type: format, quality });
          if (fallback.type !== format) throw new Error('WebP encoding is unsupported.');
          bytes = await fallback.arrayBuffer();
        }
      } else if (format === 'image/avif') {
        const { encodeAvif } = await import('./avif-encoder.ts');
        const encoded = await encodeAvif(pixels, quality);
        bytes = await encoded.arrayBuffer();
      } else {
        // Flatten alpha against white: transparent PNGs must not become black.
        // The worker handles one output format per request. Flatten in-place
        // rather than copying a second 14MP RGBA buffer (~56MB).
        const rgba = pixels.data;
        for (let i = 0; i < rgba.length; i += 4) {
          const a = rgba[i + 3] / 255;
          if (a !== 1) {
            rgba[i] = Math.round(rgba[i] * a + 255 * (1 - a));
            rgba[i + 1] = Math.round(rgba[i + 1] * a + 255 * (1 - a));
            rgba[i + 2] = Math.round(rgba[i + 2] * a + 255 * (1 - a));
            rgba[i + 3] = 255;
          }
        }
        try {
          const jpeg = await import('@jsquash/jpeg/encode');
          bytes = await jpeg.default(
            new ImageData(rgba, dimensions.width, dimensions.height),
            { quality: Math.round(quality * 100), progressive: true, optimize_coding: true }
          );
        } catch {
          usedBrowserFallback = true;
          const canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('No fallback JPEG encoder available.');
          ctx.putImageData(new ImageData(rgba, dimensions.width, dimensions.height), 0, 0);
          const fallback = await canvas.convertToBlob({ type: 'image/jpeg', quality });
          if (fallback.type !== 'image/jpeg') throw new Error('JPEG encoding is unsupported.');
          bytes = await fallback.arrayBuffer();
        }
      }
      if (!bytes || bytes.byteLength === 0) throw new Error('The encoder returned no image data.');
      return new Blob([bytes as BlobPart], { type: format });
    };

    const started = Date.now();
    const result = await optimizeAdaptive(source, encode, {
      targetBytes,
      allowResize,
      minimumShortSide: 640,
      minimumQuality: format === 'image/avif' ? 0.5 : 0.7,
      maximumQuality: format === 'image/avif' ? 0.85 : 1,
      onAttempt: (count) => scope.postMessage({ type: 'progress', attempts: count })
    });

    let best = result;
    let evidence: { metric: 'milo'; rawError: number; improved: boolean; scoredCandidates: number; comparisonLongSide: number } | undefined;
    if (mode === 'perceptual' && result.status === 'within-target') {
      const { scorePerceptualMilo } = await import('./perceptual-scorer.ts');
      // A scorer failure is surfaced, never fabricated as a score.
      let error = await scorePerceptualMilo(sourceCanvas, result.blob);
      const plan = planPerceptualCandidates({
        source, baseline: result,
        allowResize, minShortSide: 640,
        maxCandidates: format === 'image/avif' ? 3 : 4
      });
      let scoredCandidates = 1;
      let improvements = 0;
      for (const candidate of plan) {
        // Soft budget limits additional encoding/scoring work. Worker can still
        // be terminated immediately on user cancellation.
        if (Date.now() - started > 35_000) break;
        const blob = await encode(candidate, candidate.quality);
        scope.postMessage({ type: 'progress', attempts: result.attempts + scoredCandidates });
        if (blob.size === 0 || blob.size > targetBytes) continue;
        const rawError = await scorePerceptualMilo(sourceCanvas, blob);
        scoredCandidates++;
        if (isBetterPerceptualCandidate(
          { ...candidate, blob, error: rawError },
          { width: best.width, height: best.height, quality: best.quality, blob: best.blob, error },
          targetBytes
        )) {
          error = rawError;
          best = { ...result, ...candidate, blob, resized: candidate.width !== source.width || candidate.height !== source.height };
          improvements++;
        }
      }
      evidence = { metric: 'milo', rawError: error, improved: improvements > 0, scoredCandidates, comparisonLongSide: 256 };
    }

    scope.postMessage({
      type: 'result',
      result: {
        blob: best.blob,
        quality: best.quality,
        attempts: result.attempts + (evidence?.scoredCandidates ?? 0),
        status: best.status,
        resized: best.resized,
        width: best.width,
        height: best.height,
        qualityEvidence: evidence,
        format,
        engine: usedBrowserFallback ? 'browser-fallback' : 'wasm'
      }
    });
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Unable to compress this image.'
    });
  } finally {
    bitmap?.close();
    if (originalCanvas) {
      originalCanvas.width = 0;
      originalCanvas.height = 0;
    }
  }
};
