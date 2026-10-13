import { describe, expect, it } from 'vitest';
import { validateImageSignature } from '../../../src/lib/modules/image-compress/adapters/browser-encoder.ts';

const file = (bytes: number[], type: string) =>
  new File([new Uint8Array(bytes)], 'sample', { type });
const PNG = [137,80,78,71,13,10,26,10];

describe('image upload boundary', () => {
  it('rejects mismatched MIME/signature instead of decoding it', async () => {
    await expect(validateImageSignature(file([1,2,3,4], 'image/jpeg'))).rejects.toThrow('does not match');
    await expect(validateImageSignature(file(PNG, 'image/jpeg'))).rejects.toThrow('does not match');
  });
  it('accepts still image signature headers', async () => {
    await expect(validateImageSignature(file([255,216,255,217], 'image/jpeg'))).resolves.toBeUndefined();
    await expect(validateImageSignature(file(PNG, 'image/png'))).resolves.toBeUndefined();
    await expect(validateImageSignature(file([82,73,70,70,20,0,0,0,87,69,66,80,86,80,56,32], 'image/webp'))).resolves.toBeUndefined();
  });
  it('rejects APNG and animated WebP instead of silently dropping frames', async () => {
    // acTL is a PNG animation control chunk preceding image data.
    const actl = [0,0,0,8,97,99,84,76,0,0,0,1,0,0,0,0,0,0,0,0];
    await expect(validateImageSignature(file([...PNG,...actl],'image/png'))).rejects.toThrow('Animated PNG');
    const vp8x = [82,73,70,70,20,0,0,0,87,69,66,80,86,80,56,88,10,0,0,0,2,0,0,0];
    await expect(validateImageSignature(file(vp8x,'image/webp'))).rejects.toThrow('Animated WebP');
  });
});
