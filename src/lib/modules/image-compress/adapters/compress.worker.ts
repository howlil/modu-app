/// <reference lib="webworker" />
import createPica from 'pica';
import { encodeRGBA } from 'wasm-webp';
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
  try {
    const { file, format, targetBytes, allowResize } = event.data;
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const source = { width: bitmap.width, height: bitmap.height };
    const resizer = createPica({ features: ['js', 'wasm'], concurrency: 1 });
    const originalCanvas = new OffscreenCanvas(source.width, source.height);
    const originalContext = originalCanvas.getContext('2d', { willReadFrequently: true });
    if (!originalContext) throw new Error('Canvas initialization failed.');
    originalContext.drawImage(bitmap, 0, 0);

    let currentPixels: ImageData | undefined;
    let currentKey = '';
    const pixelsAt = async (dimensions: Dimensions): Promise<ImageData> => {
      const key = dimensions.width + 'x' + dimensions.height;
      if (key === currentKey && currentPixels) return currentPixels;
      if (key === source.width + 'x' + source.height) {
        currentPixels = originalContext.getImageData(0, 0, source.width, source.height);
      } else {
        const scaledCanvas = new OffscreenCanvas(dimensions.width, dimensions.height);
        await resizer.resize(originalCanvas, scaledCanvas, { filter: 'mks2013' });
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
        const raw = await encodeRGBA(
          new Uint8Array(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength),
          dimensions.width, dimensions.height, Math.round(quality * 100)
        );
        bytes = raw ? new Uint8Array(raw) : null;
      } else {
        const jpeg = await import('@jsquash/jpeg/encode');
        // Flatten alpha against white: transparent PNGs must not become black.
        const rgba = new Uint8ClampedArray(pixels.data);
        for (let i = 0; i < rgba.length; i += 4) {
          const a = rgba[i + 3] / 255;
          if (a !== 1) {
            rgba[i] = Math.round(rgba[i] * a + 255 * (1 - a));
            rgba[i + 1] = Math.round(rgba[i + 1] * a + 255 * (1 - a));
            rgba[i + 2] = Math.round(rgba[i + 2] * a + 255 * (1 - a));
            rgba[i + 3] = 255;
          }
        }
        bytes = await jpeg.default(
          new ImageData(rgba, dimensions.width, dimensions.height),
          { quality: Math.round(quality * 100), progressive: true, optimize_coding: true }
        );
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
        format
      }
    });
    originalCanvas.width = 0;
    originalCanvas.height = 0;
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Unable to compress this image.'
    });
  } finally {
    bitmap?.close();
  }
};
