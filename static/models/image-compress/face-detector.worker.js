/* Classic Worker only: the pinned MediaPipe Emscripten loader uses importScripts().
 * All assets are hosted by Modu. Never post image pixels over HTTP.
 */
self.onmessage = async function(event) {
  const bitmap = event.data.bitmap;
  let detector;
  try {
    if (!self.visionM3) {
      self.module = {exports:{}};
      self.exports = self.module.exports;
      importScripts('/models/image-compress/vision_bundle.cjs');
      self.visionM3 = self.module.exports;
      if (!self.visionM3.FaceDetector || !self.visionM3.FilesetResolver)
        throw new Error('MediaPipe classic bundle did not export detector APIs.');
    }
    const {FaceDetector,FilesetResolver}=self.visionM3;
    const fileset=await FilesetResolver.forVisionTasks('/models/image-compress/wasm');
    detector=await FaceDetector.createFromOptions(fileset,{
      baseOptions:{modelAssetPath:'/models/image-compress/blaze_face_short_range.tflite',
        delegate:'CPU'},
      minDetectionConfidence:0.7,
      runningMode:'IMAGE'
    });
    const results=detector.detect(bitmap);
    const width=bitmap.width,height=bitmap.height;
    const regions=[];
    for(const [index,face] of results.detections.slice(0,4).entries()){
      const b=face.boundingBox;
      if(!b)continue;
      const pad=.15;
      regions.push({id:'face-'+index,kind:'face',source:'detector',
        confidence:Math.max(0,Math.min(1,face.categories?.[0]?.score??.7)),
        bounds:{x:(b.originX-b.width*pad)/width,y:(b.originY-b.height*pad)/height,
          width:(b.width*(1+2*pad))/width,height:(b.height*(1+2*pad))/height}});
    }
    self.postMessage({type:'result',regions});
  }catch(error){
    self.postMessage({type:'error',
      message:error instanceof Error?error.message:'Face detector failed to initialize.'});
  }finally{
    try{bitmap?.close();}catch{}
    try{detector?.close();}catch{}
  }
};
