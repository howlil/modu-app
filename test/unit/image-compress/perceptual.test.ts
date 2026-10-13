import { describe, expect, it } from 'vitest';
import { isBetterPerceptualCandidate, planPerceptualCandidates } from '../../../src/lib/modules/image-compress/core/perceptual.ts';
const blob = (n:number) => new Blob([new Uint8Array(n)]);
const candidate = (error:number, bytes:number, width=800, height=800) =>
  ({ error, blob:blob(bytes), width, height, quality:.8 });
describe('M2 bounded perceptual plan', () => {
  const base={ source:{width:2000,height:1600}, baseline:{width:1000,height:800,quality:.8} };
  it('respects maximum attempts and never resizes without permission',()=>{
    const out=planPerceptualCandidates({...base,allowResize:false,maxCandidates:4});
    expect(out.length).toBeLessThanOrEqual(4);
    expect(out.every(x=>x.width===2000&&x.height===1600)).toBe(true);
  });
  it('keeps aspect ratio and minimum short side with permission',()=>{
    const out=planPerceptualCandidates({...base,allowResize:true});
    expect(out.length).toBeGreaterThan(0);
    expect(out.every(x=>Math.min(x.width,x.height)>=640)).toBe(true);
    expect(out.every(x=>Math.abs(x.width/x.height-1.25)<0.01)).toBe(true);
    expect(new Set(out.map(x=>`${x.width}:${x.height}:${x.quality}`)).size).toBe(out.length);
  });
  it('prefers better perceptual error within bytes, not higher encoder quality',()=>{
    expect(isBetterPerceptualCandidate(candidate(.008,49000),candidate(.014,48000),50000)).toBe(true);
    expect(isBetterPerceptualCandidate(candidate(.001,51000),candidate(.014,48000),50000)).toBe(false);
    expect(isBetterPerceptualCandidate(candidate(NaN,40000),candidate(.014,48000),50000)).toBe(false);
  });
  it('rejects cosmetic score differences unless resolution improves',()=>{
    expect(isBetterPerceptualCandidate(candidate(.01001,48000),candidate(.01,49000),50000)).toBe(false);
  });
});
