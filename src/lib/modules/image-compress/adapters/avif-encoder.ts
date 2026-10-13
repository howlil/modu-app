/** AVIF encoder loads only after the user explicitly chooses the format. */
export async function encodeAvif(image: ImageData, quality: number): Promise<Blob> {
  const { default: encode } = await import('@jsquash/avif/encode');
  const bytes = await encode(image, {
    quality: Math.round(quality * 100),
    speed: 8, bitDepth: 8, subsample: 1
  });
  if (!bytes || bytes.byteLength === 0) throw new Error('AVIF encoder returned an empty image.');
  return new Blob([bytes], { type: 'image/avif' });
}
