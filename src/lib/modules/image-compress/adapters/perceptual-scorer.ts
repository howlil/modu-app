/** Browser-only perceptual comparison. MILO rawError (lower=better), NOT SSIMULACRA2.
 * Both images are normalized to a common display size before comparison.
 * Lazy WASM import avoids impacting standard M1 compression.
 */
export async function scorePerceptualMilo(sourceCanvas: OffscreenCanvas, candidate: Blob): Promise<number> {
  const width = 256;
  const height = Math.max(16, Math.round(width * sourceCanvas.height / sourceCanvas.width));
  const normalizedWidth = Math.max(16, Math.min(256, Math.round(256 * sourceCanvas.width / Math.max(sourceCanvas.width, sourceCanvas.height))));
  const normalizedHeight = Math.max(16, Math.min(256, Math.round(256 * sourceCanvas.height / Math.max(sourceCanvas.width, sourceCanvas.height))));
  const reference = new OffscreenCanvas(normalizedWidth, normalizedHeight);
  const distorted = new OffscreenCanvas(normalizedWidth, normalizedHeight);
  const refCtx = reference.getContext('2d', { willReadFrequently: true });
  const dstCtx = distorted.getContext('2d', { willReadFrequently: true });
  if (!refCtx || !dstCtx) throw new Error('Unable to initialize quality comparison.');
  let bitmap: ImageBitmap | undefined;
  try {
    refCtx.fillStyle = '#fff';
    refCtx.fillRect(0,0,normalizedWidth,normalizedHeight);
    refCtx.drawImage(sourceCanvas,0,0,normalizedWidth,normalizedHeight);
    bitmap = await createImageBitmap(candidate);
    dstCtx.fillStyle = '#fff';
    dstCtx.fillRect(0,0,normalizedWidth,normalizedHeight);
    dstCtx.drawImage(bitmap,0,0,normalizedWidth,normalizedHeight);
    const original = refCtx.getImageData(0,0,normalizedWidth,normalizedHeight).data;
    const output = dstCtx.getImageData(0,0,normalizedWidth,normalizedHeight).data;
    const { initMilo, milo } = await import('@blazediff/milo-wasm');
    await initMilo();
    const scored = await milo(
      new Uint8Array(original.buffer,original.byteOffset,original.byteLength),
      new Uint8Array(output.buffer,output.byteOffset,output.byteLength),
      normalizedWidth,normalizedHeight
    );
    if (!Number.isFinite(scored.rawError) || scored.rawError < 0) {
      throw new Error('Perceptual scorer returned an invalid value.');
    }
    return scored.rawError;
  } finally {
    bitmap?.close();
    reference.width=0;reference.height=0;
    distorted.width=0;distorted.height=0;
  }
}
