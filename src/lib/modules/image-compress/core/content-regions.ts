export type RegionKind = 'face' | 'text-like' | 'manual';
export interface NormalizedRect { x: number; y: number; width: number; height: number }
export interface ImportantRegion { id: string; kind: RegionKind; bounds: NormalizedRect; confidence: number; source: 'detector' | 'heuristic' | 'user' }
export interface ContentMap { sourceWidth: number; sourceHeight: number; regions: ImportantRegion[]; analysisVersion: 'm3-v1'; faceStatus: 'detected' | 'none' | 'unavailable' | 'skipped' }
export const MAX_REGIONS = 4;
export function normalizeRegion(input: ImportantRegion): ImportantRegion | null {
  const b=input.bounds;
  if (!Object.values(b).every(Number.isFinite) || !Number.isFinite(input.confidence)) return null;
  const x=Math.max(0,Math.min(1,b.x)),y=Math.max(0,Math.min(1,b.y));
  const width=Math.max(0,Math.min(1-x,b.width));
  const height=Math.max(0,Math.min(1-y,b.height));
  if(width<0.015||height<0.015||input.confidence<0||input.confidence>1) return null;
  return {...input,bounds:{x,y,width,height}};
}
export function intersectOverUnion(a:NormalizedRect,b:NormalizedRect):number {
  const w=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x));
  const h=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  const area=w*h;
  return area/(a.width*a.height+b.width*b.height-area||1);
}
export function selectRegions(regions:ImportantRegion[]):ImportantRegion[] {
  const result:ImportantRegion[]=[];
  for(const r of regions.map(normalizeRegion).filter((r):r is ImportantRegion=>r!==null)
    .sort((a,b)=>a.source==='user'?-1:b.source==='user'?1:b.confidence-a.confidence)) {
    if(result.some(previous=>intersectOverUnion(previous.bounds,r.bounds)>0.55))continue;
    result.push(r);
    if(result.length>=MAX_REGIONS)break;
  }
  return result;
}
export function rectInPixels(rect:NormalizedRect,width:number,height:number) {
  const x=Math.floor(rect.x*width),y=Math.floor(rect.y*height);
  const right=Math.ceil((rect.x+rect.width)*width),bottom=Math.ceil((rect.y+rect.height)*height);
  return {x,y,width:Math.max(1,right-x),height:Math.max(1,bottom-y)};
}
