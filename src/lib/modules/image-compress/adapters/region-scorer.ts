import type {ImportantRegion} from '../core/content-regions.ts';
import {rectInPixels} from '../core/content-regions.ts';
import {scorePerceptualMilo} from './perceptual-scorer.ts';

export interface LocalQuality {globalError:number;regions:{regionId:string;error:number}[]}
/** Aligned original/output ROI scoring. Decode candidate exactly once.
 * Crops are displayed with the same geometry; no detail is reconstructed.
 */
export async function scoreContentAware(
  source:OffscreenCanvas,
  encoded:Blob,
  regions:ImportantRegion[]
):Promise<LocalQuality> {
  const globalError=await scorePerceptualMilo(source,encoded);
  if(!regions.length)return {globalError,regions:[]};
  const bitmap=await createImageBitmap(encoded);
  const {initMilo,milo}=await import('@blazediff/milo-wasm');
  try{
    await initMilo();
    const details:LocalQuality['regions']=[];
    for(const region of regions.slice(0,4)){
      const src=rectInPixels(region.bounds,source.width,source.height);
      const dst=rectInPixels(region.bounds,bitmap.width,bitmap.height);
      const longer=Math.max(src.width,src.height);
      const w=Math.max(16,Math.round(src.width*256/longer));
      const h=Math.max(16,Math.round(src.height*256/longer));
      const a=new OffscreenCanvas(w,h),b=new OffscreenCanvas(w,h);
      try{
        const ref=a.getContext('2d',{willReadFrequently:true});
        const cmp=b.getContext('2d',{willReadFrequently:true});
        if(!ref||!cmp)throw new Error('ROI quality comparison cannot initialize.');
        for(const c of [ref,cmp]){c.fillStyle='#fff';c.fillRect(0,0,w,h);}
        ref.drawImage(source,src.x,src.y,src.width,src.height,0,0,w,h);
        cmp.drawImage(bitmap,dst.x,dst.y,dst.width,dst.height,0,0,w,h);
        const left=ref.getImageData(0,0,w,h).data;
        const right=cmp.getImageData(0,0,w,h).data;
        const metric=await milo(new Uint8Array(left.buffer,left.byteOffset,left.byteLength),
          new Uint8Array(right.buffer,right.byteOffset,right.byteLength),w,h);
        if(!Number.isFinite(metric.rawError)||metric.rawError<0)throw new Error('Invalid ROI quality score.');
        details.push({regionId:region.id,error:metric.rawError});
      }finally{a.width=0;a.height=0;b.width=0;b.height=0;}
    }
    return {globalError,regions:details};
  }finally{bitmap.close();}
}
