import type { ImportantRegion } from '../core/content-regions.ts';
import {selectRegions} from '../core/content-regions.ts';

/** MediaPipe uses importScripts()-based Emscripten loaders. Keep it in a
 * dedicated classic Worker rather than the compressor's Vite module Worker.
 * Pixel buffers never leave the browser.
 */
export async function detectFaces(source:OffscreenCanvas):Promise<ImportantRegion[]> {
  const longest=Math.max(source.width,source.height);
  const width=Math.max(1,Math.round(source.width*1024/longest));
  const height=Math.max(1,Math.round(source.height*1024/longest));
  const canvas=new OffscreenCanvas(width,height);
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Face inference canvas unavailable.');
  let bitmap:ImageBitmap|undefined;
  try{
    ctx.drawImage(source,0,0,width,height);
    bitmap=await createImageBitmap(canvas);
  }finally{canvas.width=0;canvas.height=0;}
  const url=new URL('/models/image-compress/face-detector.worker.js',self.location.origin).href;
  let worker:Worker;
  try{worker=new Worker(url,{type:'classic'});}catch(error){bitmap?.close();throw error;}
  return new Promise<ImportantRegion[]>((resolve,reject)=>{
    let done=false;
    const timer=setTimeout(()=>finish(new Error('Face detector initialization timed out.')),16000);
    const finish=(error:Error|null,regions:ImportantRegion[]=[]):void=>{
      if(done)return;
      done=true;
      clearTimeout(timer);
      worker.terminate();
      if(error)reject(error);
      else resolve(selectRegions(regions));
    };
    worker.onerror=()=>finish(new Error('Local face detector worker failed.'));
    worker.onmessage=(event:MessageEvent<{
      type:'result'|'error';regions?:ImportantRegion[];message?:string;
    }>)=>{
      if(event.data.type==='error')finish(new Error(event.data.message||'Local face detector unavailable.'));
      else finish(null,event.data.regions??[]);
    };
    try{
      worker.postMessage({bitmap},[bitmap!]);
      bitmap=undefined; // Ownership transferred to classic worker.
    }catch(error){
      bitmap?.close();
      finish(error instanceof Error?error:new Error('Face image could not be transferred.'));
    }
  });
}
