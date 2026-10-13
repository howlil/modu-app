import {describe,it,expect} from 'vitest';
import {detectTextLikeRegions} from '../../../src/lib/modules/image-compress/adapters/content-analyzer.ts';

function createImage(width:number,height:number,
  pixel:(x:number,y:number)=>number):ImageData {
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,v=pixel(x,y);
    data[i]=v;data[i+1]=v;data[i+2]=v;data[i+3]=255;
  }
  return {width,height,data} as ImageData;
}

describe('M3 bounded text-like detail detection',()=>{
  it('does not hallucinate text in flat images',()=>{
    expect(detectTextLikeRegions(createImage(192,128,()=>220))).toEqual([]);
  });
  it('returns normalized valid regions from dense small strokes',()=>{
    const img=createImage(256,128,(x,y)=>{
      if(y<24||y>=105)return 220;
      return (((x%5)<2) !== ((y%7)<3)) ? 20:250;
    });
    const regions=detectTextLikeRegions(img);
    expect(regions.length).toBeGreaterThan(0);
    expect(regions.length).toBeLessThanOrEqual(2);
    expect(regions.every(r=>r.kind==='text-like'&&
      r.bounds.x>=0&&r.bounds.y>=0&&r.bounds.x+r.bounds.width<=1.000001)).toBe(true);
  });
  it('limits expensive region counts',()=>{
    const img=createImage(256,128,(x,y)=>((x*13+y*17)%127)<60?20:240);
    expect(detectTextLikeRegions(img,1).length).toBeLessThanOrEqual(1);
  });
});
