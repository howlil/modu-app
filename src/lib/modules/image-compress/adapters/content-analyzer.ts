import type { ImportantRegion } from '../core/content-regions.ts';
import { selectRegions } from '../core/content-regions.ts';

/** Detect clusters of thin, high-frequency strokes. This is NOT OCR.
 * Work on a <=512px analysis canvas; never allocate additional full-resolution
 * copies of an uploaded image.
 */
export function detectTextLikeRegions(image: ImageData, limit=2): ImportantRegion[] {
  const {width,height,data}=image;
  if(width<64||height<48) return [];
  const block=16,columns=Math.ceil(width/block),rows=Math.ceil(height/block);
  const gray=new Uint8Array(width*height);
  for(let i=0;i<gray.length;i++) {
    const o=i*4;
    gray[i]=Math.round((data[o]*.299)+(data[o+1]*.587)+(data[o+2]*.114));
  }
  const scores=new Float32Array(columns*rows);
  let peak=0;
  for(let by=0;by<rows;by++)for(let bx=0;bx<columns;bx++) {
    let count=0,n=0;
    const beginY=Math.max(1,by*block),endY=Math.min(height-1,(by+1)*block);
    const beginX=Math.max(1,bx*block),endX=Math.min(width-1,(bx+1)*block);
    for(let y=beginY;y<endY;y+=2)for(let x=beginX;x<endX;x+=2){
      const pos=y*width+x;
      const dx=Math.abs(gray[pos-1]-gray[pos+1]);
      const dy=Math.abs(gray[pos-width]-gray[pos+width]);
      // Text-like strokes produce dense transitions in both axes.
      if(dx>32&&dy>18) count++;
      n++;
    }
    const val=n?count/n:0;
    scores[by*columns+bx]=val;
    peak=Math.max(peak,val);
  }
  // Low-density natural images have no defensible text-like ROI.
  if(peak<.12)return [];
  const threshold=Math.max(.09,peak*.35);
  const rowStrength=new Float32Array(rows);
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)
    if(scores[y*columns+x]>=threshold)rowStrength[y]++;
  const groups:Array<{start:number;end:number;sum:number}>=[];
  for(let y=0;y<rows;) {
    if(rowStrength[y]<Math.max(2,columns*.12)){y++;continue;}
    const start=y;let sum=0;
    while(y<rows && rowStrength[y]>=Math.max(2,columns*.12)){sum+=rowStrength[y];y++;}
    if(y-start>=2)groups.push({start,end:y,sum});
  }
  return selectRegions(groups.sort((a,b)=>b.sum-a.sum).slice(0,limit).map((g,i)=>{
    let left=columns,right=0;
    for(let y=g.start;y<g.end;y++)for(let x=0;x<columns;x++)
      if(scores[y*columns+x]>=threshold){left=Math.min(left,x);right=Math.max(right,x+1);}
    const x=Math.max(0,(left*block-16)/width), y=Math.max(0,(g.start*block-10)/height);
    const endX=Math.min(1,(right*block+16)/width),endY=Math.min(1,(g.end*block+10)/height);
    return {id:'text-'+i,kind:'text-like' as const,source:'heuristic' as const,
      confidence:Math.min(.9,.4+g.sum/(columns*rows)),bounds:{x,y,width:endX-x,height:endY-y}};
  }));
}

export function analyzeTextDetails(canvas: OffscreenCanvas):ImportantRegion[] {
  const long=Math.max(canvas.width,canvas.height);
  const width=Math.max(64,Math.round(canvas.width*512/long));
  const height=Math.max(48,Math.round(canvas.height*512/long));
  const scaled=new OffscreenCanvas(width,height);
  try{
    const ctx=scaled.getContext('2d',{willReadFrequently:true});
    if(!ctx)return [];
    ctx.drawImage(canvas,0,0,width,height);
    return detectTextLikeRegions(ctx.getImageData(0,0,width,height));
  }finally{scaled.width=0;scaled.height=0;}
}
