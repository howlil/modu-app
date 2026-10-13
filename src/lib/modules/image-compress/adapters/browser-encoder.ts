import {
  MAX_IMAGE_PIXELS,
  MAX_INPUT_BYTES,
  type ImageOutputFormat,
  type TargetSizeResult
} from '../core/target-size.ts';

const INPUT_FORMATS = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface ImageInfo { width: number; height: number }
export interface EncodedImage extends TargetSizeResult, ImageInfo {
  format: ImageOutputFormat;
  resized: boolean;
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
  const bitmap = await createImageBitmap(file);
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
  allowResize = false
): Promise<EncodedImage> {
  validateFile(file);
  if (signal?.aborted) throw new DOMException('Compression canceled.', 'AbortError');

  // An exact-format original below budget is always preferable to re-encoding.
  if (file.type === format && file.size <= targetBytes) {
    const info = await inspectImage(file);
    return {
      blob: file, quality: 1, attempts: 0, status: 'within-target',
      ...info, format, resized: false
    };
  }
  if (typeof Worker === 'undefined') {
    throw new Error('This browser does not support background image processing.');
  }

  return new Promise<EncodedImage>((resolve, reject) => {
    const worker = new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    function finish(): void {
      settled = true;
      worker.terminate();
      signal?.removeEventListener('abort', cancel);
    }
    function cancel(): void {
      if (settled) return;
      finish();
      reject(new DOMException('Compression canceled.', 'AbortError'));
    }
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
    worker.postMessage({ file, format, targetBytes, allowResize });
  });
}
