import { encodeImageToTarget, inspectImage, type EncodedImage, type ImageInfo } from '../adapters/browser-encoder.ts';
import { MAX_TARGET_KB, MIN_TARGET_KB, targetBytesFromKB, type ImageOutputFormat } from '../core/target-size.ts';

type CompressionStatus = 'idle' | 'inspecting' | 'ready' | 'processing' | 'complete' | 'quality-limited' | 'error';

export function createImageCompressController() {
  let file = $state<File | null>(null);
  let info = $state<ImageInfo | null>(null);
  let originalUrl = $state('');
  let outputUrl = $state('');
  let output = $state<EncodedImage | null>(null);
  let format = $state<ImageOutputFormat>('image/webp');
  let targetInput = $state('200');
  let allowResize = $state(false);
  let status = $state<CompressionStatus>('idle');
  let error = $state('');
  let attempts = $state(0);
  let revision = 0;
  let activeAbort: AbortController | null = null;

  function invalidateRunning(): number {
    revision += 1;
    activeAbort?.abort();
    activeAbort = null;
    return revision;
  }

  function clearOutput(): void {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = '';
    output = null;
    attempts = 0;
  }

  function releaseImage(): void {
    clearOutput();
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    originalUrl = '';
    file = null;
    info = null;
  }

  function resetResult(): void {
    invalidateRunning();
    clearOutput();
    error = '';
    status = file && info ? 'ready' : 'idle';
  }

  async function setFile(next: File | null): Promise<void> {
    const run = invalidateRunning();
    releaseImage();
    error = '';
    status = 'idle';
    if (!next) return;
    status = 'inspecting';
    try {
      const inspected = await inspectImage(next);
      if (run !== revision) return;
      file = next;
      info = inspected;
      originalUrl = URL.createObjectURL(next);
      status = 'ready';
    } catch (cause) {
      if (run !== revision) return;
      error = cause instanceof Error ? cause.message : 'Unable to read this image.';
      status = 'error';
    }
  }

  function setTargetInput(value: string): void {
    targetInput = value;
    resetResult();
  }

  function setFormat(value: ImageOutputFormat): void {
    if (format === value) return;
    format = value;
    resetResult();
  }

  function setAllowResize(value: boolean): void {
    allowResize = value;
    resetResult();
  }

  function getTargetError(): string {
    const parsed = Number(targetInput);
    if (!targetInput.trim() || !Number.isInteger(parsed) || parsed < MIN_TARGET_KB || parsed > MAX_TARGET_KB) {
      return 'Enter a whole number between 10 and 20,480 KB.';
    }
    return '';
  }

  async function compress(): Promise<void> {
    if (!file || !info || status === 'processing') return;
    const inputError = getTargetError();
    if (inputError) {
      error = inputError;
      return;
    }
    const selectedFile = file;
    const selectedFormat = format;
    const targetBytes = targetBytesFromKB(Number(targetInput));
    const run = invalidateRunning();
    clearOutput();
    error = '';
    status = 'processing';
    const abort = new AbortController();
    activeAbort = abort;

    try {
      const encoded = await encodeImageToTarget(
        selectedFile, selectedFormat, targetBytes,
        (count) => { if (run === revision) attempts = count; },
        abort.signal,
        allowResize
      );
      if (run !== revision) return;
      output = encoded;
      outputUrl = URL.createObjectURL(encoded.blob);
      status = encoded.status === 'within-target' ? 'complete' : 'quality-limited';
    } catch (cause) {
      if (run !== revision) return;
      error = cause instanceof Error ? cause.message : 'Compression failed.';
      status = 'error';
    } finally {
      if (run === revision) activeAbort = null;
    }
  }

  function download(): void {
    if (!output || !outputUrl || !file) return;
    const extension = output.format === 'image/jpeg' ? 'jpg' : 'webp';
    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    const anchor = document.createElement('a');
    anchor.href = outputUrl;
    anchor.download = base + '-modu.' + extension;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function dispose(): void {
    invalidateRunning();
    releaseImage();
  }

  return {
    get file() { return file; },
    get info() { return info; },
    get originalUrl() { return originalUrl; },
    get outputUrl() { return outputUrl; },
    get output() { return output; },
    get format() { return format; },
    get allowResize() { return allowResize; },
    get targetInput() { return targetInput; },
    get status() { return status; },
    get error() { return error; },
    get attempts() { return attempts; },
    get targetError() { return getTargetError(); },
    setFile, setTargetInput, setFormat, setAllowResize, compress, download, dispose
  };
}
