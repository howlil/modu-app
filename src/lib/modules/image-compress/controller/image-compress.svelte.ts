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
  let retryNotice = $state('');
  let optimizationNotice = $state('');
  let attempts = $state(0);
  let revision = 0;
  let activeAbort: AbortController | null = null;
  let cancelRestores: CompressionStatus = 'ready';

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
    retryNotice = '';
    optimizationNotice = '';
  }

  function releaseImage(): void {
    clearOutput();
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    originalUrl = '';
    file = null;
    info = null;
  }

  function resetResult(): void {
    // Changing settings while decoding a newly selected image must not
    // invalidate the pending file inspection. Only encoding is abortable here.
    if (status === 'inspecting') {
      clearOutput();
      error = '';
      return;
    }
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

  /**
   * Shared compression runner. Recovery keeps the prior result downloadable until
   * a *within-target* replacement has been validated by the encoder adapter.
   */
  async function runCompression(
    resize: boolean,
    retainPrevious = false,
    mode: 'standard' | 'perceptual' = 'standard'
  ): Promise<void> {
    if (!file || !info || status === 'processing') return;
    const inputError = getTargetError();
    if (inputError) {
      error = inputError;
      return;
    }

    const selectedFile = file;
    const selectedFormat = format;
    const targetBytes = targetBytesFromKB(Number(targetInput));
    const previousStatus = status;
    const preserve = retainPrevious && Boolean(output && outputUrl);
    const run = invalidateRunning();

    if (!preserve) clearOutput();
    attempts = 0;
    error = '';
    retryNotice = '';
    optimizationNotice = '';
    allowResize = resize;
    cancelRestores = preserve ? previousStatus : 'ready';
    status = 'processing';
    const abort = new AbortController();
    activeAbort = abort;

    try {
      const encoded = await encodeImageToTarget(
        selectedFile,
        selectedFormat,
        targetBytes,
        (count) => { if (run === revision) attempts = count; },
        abort.signal,
        resize,
        mode
      );
      if (run !== revision) return;

      if (mode === 'perceptual' && preserve &&
          (encoded.status !== 'within-target' || !encoded.qualityEvidence?.improved)) {
        status = previousStatus;
        optimizationNotice = 'No better result found within this target. Your previous image was kept.';
        return;
      }

      // An unreachable retry must not replace a usable previous result.
      if (preserve && encoded.status !== 'within-target') {
        status = previousStatus;
        retryNotice = 'Smart resize could not reach the target within the 640 px minimum. Previous result kept.';
        return;
      }

      // The adapter validates output bytes and dimensions before resolving.
      // Create the next URL before revoking the old one.
      const nextUrl = URL.createObjectURL(encoded.blob);
      const previousUrl = outputUrl;
      output = encoded;
      outputUrl = nextUrl;
      status = encoded.status === 'within-target' ? 'complete' : 'quality-limited';
      if (previousUrl) URL.revokeObjectURL(previousUrl);
    } catch (cause) {
      if (run !== revision) return;
      error = cause instanceof Error ? cause.message : 'Compression failed.';
      status = preserve ? previousStatus : 'error';
    } finally {
      if (run === revision) activeAbort = null;
    }
  }

  function compress(): Promise<void> {
    return runCompression(allowResize);
  }

  function cancel(): void {
    if (status !== 'processing') return;
    invalidateRunning(); // Terminates the in-flight Web Worker via AbortSignal.
    status = output ? cancelRestores : (file && info ? 'ready' : 'idle');
    error = '';
    attempts = 0;
  }

  function optimizeVisualQuality(): Promise<void> {
    if (status !== 'complete' || !output || !outputUrl || !file || !info) return Promise.resolve();
    return runCompression(allowResize, true, 'perceptual');
  }

  function recompressWithResize(): Promise<void> {
    if (status !== 'quality-limited' || allowResize || !file || !info || !output || !outputUrl) {
      return Promise.resolve();
    }
    return runCompression(true, true);
  }

  function download(): void {
    if (!output || !outputUrl || !file) return;
    const extension = output.format === 'image/jpeg' ? 'jpg' : output.format === 'image/avif' ? 'avif' : 'webp';
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
    get retryNotice() { return retryNotice; },
    get optimizationNotice() { return optimizationNotice; },
    get attempts() { return attempts; },
    get targetError() { return getTargetError(); },
    setFile, setTargetInput, setFormat, setAllowResize, compress, cancel, recompressWithResize, optimizeVisualQuality, download, dispose
  };
}
