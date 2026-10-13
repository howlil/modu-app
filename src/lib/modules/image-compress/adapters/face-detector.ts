import type {ImportantRegion} from '../core/content-regions.ts';
import {selectRegions} from '../core/content-regions.ts';

/** Local MediaPipe model inference in the compressor Web Worker.
 * Model and WASM assets are served by Modu itself. Never send image pixels to a server.
 */
export async function detectFaces(source:OffscreenCanvas):Promise<ImportantRegion[]> {
  const {FaceDetector,FilesetResolver}=await import('@mediapipe/tasks-vision');
  const root=new URL('/models/image-compress/wasm',self.location.origin).toString();
  const model=new URL('/models/image-compress/blaze_face_short_range.tflite',self.location.origin).toString();
  const vision=await FilesetResolver.forVisionTasks(root);
  const detector=await FaceDetector.createFromOptions(vision,{
    baseOptions:{modelAssetPath:model,delegate:'CPU'},
    runningMode:'IMAGE',minDetectionConfidence:0.7
  });
  const maxSide=Math.max(source.width,source.height);
  const width=Math.max(1,Math.round(source.width*1024/maxSide));
  const height=Math.max(1,Math.round(source.height*1024/maxSide));
  const scaled=new OffscreenCanvas(width,height);
  let bitmap:ImageBitmap|undefined;
  try {
    const ctx=scaled.getContext('2d');
    if(!ctx)return [];
    ctx.drawImage(source,0,0,width,height);
    bitmap=await createImageBitmap(scaled);
    const result=detector.detect(bitmap);
    return selectRegions(result.detections.slice(0,4).map((face,index)=>{
      const b=face.boundingBox;
      const pad=.15;
      if(!b)return null;
      return {id:'face-'+index,kind:'face',source:'detector',
        confidence:Math.min(1,Math.max(0,face.categories?.[0]?.score??.7)),
        bounds:{x:(b.originX-b.width*pad)/width,y:(b.originY-b.height*pad)/height,
          width:b.width*(1+2*pad)/width,height:b.height*(1+2*pad)/height}
      } satisfies ImportantRegion;
    }).filter((r):r is ImportantRegion=>r!==null));
  } finally {
    bitmap?.close();
    scaled.width=0;scaled.height=0;
    detector.close();
  }
}
