/// <reference lib="webworker" />
import createPica from 'pica';
import { optimizeAdaptive, type Dimensions } from '../core/adaptive.ts';
import type { ImageOutputFormat } from '../core/target-size.ts';

interface Request {
  file: File;
  format: ImageOutputFormat;
  targetBytes: number;
  allowResize: boolean;
}

const scope = self as DedicatedWorkerGlobalScope;
scope.onmessage = async (event: MessageEvent<Request>) => {
  let bitmap: ImageBitmap | undefined;
  let originalCanvas: OffscreenCanvas | undefined;
  try {
    const { file, format, targetBytes, allowResize } = event.data;
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

    const result = await optimizeAdaptive(source, encode, {
      targetBytes,
      allowResize,
      minimumShortSide: 640,
      onAttempt: (count) => scope.postMessage({ type: 'progress', attempts: count })
    });

    scope.postMessage({
      type: 'result',
      result: {
        blob: result.blob,
        quality: result.quality,
        attempts: result.attempts,
        status: result.status,
        resized: result.resized,
        width: result.width,
        height: result.height,
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
