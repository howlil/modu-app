import type {ImportantRegion} from '../core/content-regions.ts';
import {
  MAX_IMAGE_PIXELS,
  MAX_INPUT_BYTES,
  type ImageOutputFormat,
  type TargetSizeResult
} from '../core/target-size.ts';

const INPUT_FORMATS = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Validate magic bytes and reject animation before opening a decoder.
 * MIME type alone is user-controlled. Bounded read prevents large allocations.
 */
export async function validateImageSignature(file: File): Promise<void> {
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 262_144)).arrayBuffer());
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  const fourcc = (offset: number) => String.fromCharCode(...bytes.slice(offset, offset + 4));
  const webp = bytes.length >= 16 && fourcc(0) === 'RIFF' && fourcc(8) === 'WEBP';
  if (!((file.type === 'image/jpeg' && jpeg) ||
        (file.type === 'image/png' && png) ||
        (file.type === 'image/webp' && webp))) {
    throw new Error('The file content does not match its image format.');
  }
  if (png) {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = ((bytes[offset] * 0x1000000) + (bytes[offset+1] << 16) +
        (bytes[offset+2] << 8) + bytes[offset+3]) >>> 0;
      const name = fourcc(offset + 4);
      if (name === 'acTL') throw new Error('Animated PNG is not supported. Choose a still image.');
      if (name === 'IDAT' || name === 'IEND' || length > bytes.length - offset - 12) break;
      offset += length + 12;
    }
  }
  if (webp && fourcc(12) === 'VP8X' && bytes.length >= 21 && (bytes[20] & 0x02)) {
    throw new Error('Animated WebP is not supported. Choose a still image.');
  }
}

export interface ImageInfo { width: number; height: number }
export interface EncodedImage extends TargetSizeResult, ImageInfo {
  format: ImageOutputFormat;
  resized: boolean;
  engine: 'wasm' | 'browser-fallback' | 'original';
  qualityEvidence?: { metric: 'milo'; rawError: number; baselineRawError?: number; improved: boolean; scoredCandidates: number; comparisonLongSide: number };
  contentEvidence?: { status:'complete'|'no-regions'|'degraded';faceStatus:'detected'|'none'|'unavailable'|'skipped';regions:ImportantRegion[];globalError?:number;baselineGlobalError?:number;regionErrors?:Array<{regionId:string;error:number}>;baselineRegionErrors?:Array<{regionId:string;error:number}>;evaluatedCandidates:number;improved:boolean };
}

function validateFile(file: File): void {
  if (!INPUT_FORMATS.has(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (file.size === 0) throw new Error('The image is empty.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('Maximum input size is 100 MB.');
}
function checkDimensions(width: number, height: number): void {
  if (!width || !height || width * height > MAX_IMAGE_PIXELS) {
    throw new Error('Image dimensions exceed the 40-megapixel processing limit.');
  }
}

export async function inspectImage(file: File): Promise<ImageInfo> {
  validateFile(file);
  await validateImageSignature(file);
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    checkDimensions(bitmap.width, bitmap.height);
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export async function encodeImageToTarget(
  file: File,
  format: ImageOutputFormat,
  targetBytes: number,
  onAttempt?: (attempts: number) => void,
  signal?: AbortSignal,
  allowResize = false,
  mode: 'standard' | 'perceptual' | 'content-aware' = 'standard',
  previousOutput?: EncodedImage,
  manualRegion?:ImportantRegion
): Promise<EncodedImage> {
  validateFile(file);
  if (signal?.aborted) throw new DOMException('Compression canceled.', 'AbortError');
  await validateImageSignature(file);
  if (signal?.aborted) throw new DOMException('Compression canceled.', 'AbortError');

  // An exact-format original below budget is always preferable to re-encoding.
  if (mode === 'standard' && file.type === format && file.size <= targetBytes) {
    const info = await inspectImage(file);
    return {
      blob: file, quality: 1, attempts: 0, status: 'within-target',
      ...info, format, resized: false, engine: 'original'
    };
  }
  if (typeof Worker === 'undefined') {
    throw new Error('This browser does not support background image processing.');
  }

  return new Promise<EncodedImage>((resolve, reject) => {
    const worker = new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    const watchdog = setTimeout(() => {
      if (settled) return;
      finish();
      reject(new Error('Compression timed out. Try a smaller image or a different output format.'));
    }, 180_000);
    function finish(): void {
      settled = true;
      clearTimeout(watchdog);
      worker.terminate();
      signal?.removeEventListener('abort', cancel);
    }
    function cancel(): void {
      if (settled) return;
      finish();
      reject(new DOMException('Compression canceled.', 'AbortError'));
    }
    worker.onmessageerror = () => {
      if (settled) return;
      finish();
      reject(new Error('Unable to receive the result from the image worker.'));
    };
    worker.onerror = () => {
      if (settled) return;
      finish();
      reject(new Error('Image encoder failed to initialize. Try another browser or format.'));
    };
    worker.onmessage = async (event: MessageEvent<{
      type: 'progress' | 'result' | 'error';
      attempts?: number;
      result?: EncodedImage;
      message?: string;
    }>) => {
      if (settled) return;
      const data = event.data;
      if (data.type === 'progress') {
        if (typeof data.attempts === 'number') onAttempt?.(data.attempts);
        return;
      }
      if (data.type === 'error' || !data.result) {
        finish();
        reject(new Error(data.message || 'Image compression failed.'));
        return;
      }
      const result = data.result;
      try {
        if (result.blob.size === 0 || result.blob.type !== format) {
          throw new Error('The output format is invalid.');
        }
        if (result.status === 'within-target' && result.blob.size > targetBytes) {
          throw new Error('The output exceeds the selected target.');
        }
        const decoded = await createImageBitmap(result.blob);
        try {
          if (decoded.width !== result.width || decoded.height !== result.height) {
            throw new Error('Output dimensions do not match the expected size.');
          }
        } finally {
          decoded.close();
        }
        if (settled) return;
        finish();
        resolve(result);
      } catch (error) {
        if (settled) return;
        finish();
        reject(error);
      }
    };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    try {
      worker.postMessage({ file, format, targetBytes, allowResize, mode,
      manualRegion:mode==='content-aware'?manualRegion:undefined,
      previousOutput: mode !== 'standard' && previousOutput ? {
        blob: previousOutput.blob, width: previousOutput.width, height: previousOutput.height,
        quality: previousOutput.quality, resized: previousOutput.resized
      } : undefined });
    } catch (error) {
      finish();
      reject(error);
    }
  });
}
