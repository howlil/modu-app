import {
  findTargetSize,
  MAX_IMAGE_PIXELS,
  MAX_INPUT_BYTES,
  type ImageOutputFormat,
  type TargetSizeResult
} from '../core/target-size.ts';

const INPUT_FORMATS = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface ImageInfo {
  width: number;
  height: number;
}

export interface EncodedImage extends TargetSizeResult, ImageInfo {
  format: ImageOutputFormat;
}

function validateFile(file: File): void {
  if (!INPUT_FORMATS.has(file.type)) {
    throw new Error('Choose a JPG, PNG, or WebP image.');
  }
  if (file.size === 0) throw new Error('The image is empty.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('Maximum input size is 100 MB.');
}

function checkDimensions(width: number, height: number): void {
  if (!width || !height || width * height > MAX_IMAGE_PIXELS) {
    throw new Error('Image dimensions exceed the 40-megapixel processing limit.');
  }
}

function ensureActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Compression canceled.', 'AbortError');
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

function canvasBlob(canvas: HTMLCanvasElement, format: ImageOutputFormat, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Browser could not encode this image.'));
      } else if (blob.type !== format) {
        reject(new Error(format === 'image/webp'
          ? 'WebP encoding is not supported by this browser. Try JPEG.'
          : 'JPEG encoding is not supported by this browser.'));
      } else {
        resolve(blob);
      }
    }, format, quality);
  });
}

export async function encodeImageToTarget(
  file: File,
  format: ImageOutputFormat,
  targetBytes: number,
  onAttempt?: (attempts: number) => void,
  signal?: AbortSignal
): Promise<EncodedImage> {
  validateFile(file);
  ensureActive(signal);
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  try {
    checkDimensions(width, height);

    // Keeping an already-small file in its existing format avoids needless loss.
    if (file.type === format && file.size <= targetBytes) {
      return { blob: file, quality: 1, attempts: 0, status: 'within-target', width, height, format };
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: format === 'image/webp' });
    if (!context) throw new Error('Unable to initialize the image encoder.');

    // JPEG has no alpha: flatten transparent inputs on white, never black.
    if (format === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(bitmap, 0, 0);

    const result = await findTargetSize(async (quality) => {
      ensureActive(signal);
      const blob = await canvasBlob(canvas, format, quality);
      ensureActive(signal);
      return blob;
    }, targetBytes, onAttempt);
    ensureActive(signal);

    const outputBitmap = await createImageBitmap(result.blob);
    try {
      if (outputBitmap.width !== width || outputBitmap.height !== height) {
        throw new Error('Output dimensions changed unexpectedly. No file was exported.');
      }
    } finally {
      outputBitmap.close();
    }
    ensureActive(signal);

    if (result.status === 'within-target' && result.blob.size > targetBytes) {
      throw new Error('Output exceeds the selected target.');
    }
    return { ...result, width, height, format };
  } finally {
    bitmap.close();
  }
}
