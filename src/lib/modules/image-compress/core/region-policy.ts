import type { ImportantRegion } from './content-regions.ts';
export interface RegionError {regionId:string;error:number}
export interface RegionScores {globalError:number;regions:RegionError[]}
export interface RegionRankingCandidate {blob:Blob;width:number;height:number;quality:number;scores:RegionScores}
export interface RegionRankingResult {wins:boolean;reason:'improvement'|'global-regression'|'region-regression'|'no-improvement'|'invalid'}
export function assessContentCandidate(
  previous:RegionRankingCandidate,
  proposed:RegionRankingCandidate,
  regions:ImportantRegion[],
  targetBytes:number,
  allowResize:boolean,
  original:{width:number;height:number}
):RegionRankingResult {
  if(proposed.blob.size<1||proposed.blob.size>targetBytes||!Number.isFinite(proposed.scores.globalError)||
    ( !allowResize && (proposed.width!==original.width||proposed.height!==original.height)) ||
    proposed.width>original.width||proposed.height>original.height) {
    return {wins:false,reason:'invalid'};
  }
  const globalTolerance=Math.max(0.00002,previous.scores.globalError*0.02);
  if(proposed.scores.globalError>previous.scores.globalError+globalTolerance)
    return {wins:false,reason:'global-regression'};
  let meaningful=false;
  const before=new Map(previous.scores.regions.map(x=>[x.regionId,x.error]));
  const after=new Map(proposed.scores.regions.map(x=>[x.regionId,x.error]));
  for(const region of regions) {
    const b=before.get(region.id),a=after.get(region.id);
    if(b===undefined||a===undefined||!Number.isFinite(a)||a<0)return {wins:false,reason:'invalid'};
    const tolerance=Math.max(0.00002,b*0.02);
    if(a>b+tolerance)return {wins:false,reason:'region-regression'};
    if(a< b-Math.max(0.00004,b*0.05))meaningful=true;
  }
  return {wins:meaningful,reason:meaningful?'improvement':'no-improvement'};
}
