import {describe,expect,it} from 'vitest';
import {normalizeRegion,selectRegions,rectInPixels,intersectOverUnion,type ImportantRegion} from '../../../src/lib/modules/image-compress/core/content-regions.ts';
import {assessContentCandidate} from '../../../src/lib/modules/image-compress/core/region-policy.ts';
const region=(id:string,x=0.2):ImportantRegion=>({id,kind:'face',confidence:.9,source:'detector',bounds:{x,y:.2,width:.2,height:.2}});
const candidate=(global:number,local:number,bytes=49000,width=1000,height=1000)=>({
  blob:new Blob([new Uint8Array(bytes)]),quality:.8,width,height,
  scores:{globalError:global,regions:[{regionId:'face',error:local}]}
});
describe('M3 content region geometry',()=>{
  it('rejects malformed regions and clips finite normalized coordinates',()=>{
    expect(normalizeRegion({...region('x'),bounds:{x:NaN,y:0,width:1,height:1}})).toBeNull();
    expect(normalizeRegion({...region('x'),bounds:{x:.9,y:.9,width:.5,height:.5}})?.bounds).toEqual({x:.9,y:.9,width:0.09999999999999998,height:0.09999999999999998});
  });
  it('deduplicates overlap, prioritizes manual choice and caps to four',()=>{
    const all=[region('one'),region('two',.21),...Array.from({length:9},(_,i)=>region(String(i),i/9))];
    const picked=selectRegions([...all,{...region('manual'),kind:'manual',source:'user'}]);
    expect(picked[0].id).toBe('manual');expect(picked.length).toBeLessThanOrEqual(4);
    expect(intersectOverUnion(region('a').bounds,region('b',.21).bounds)).toBeGreaterThan(.55);
  });
  it('scales normalized regions to output dimensions',()=>{
    expect(rectInPixels({x:.25,y:.5,width:.5,height:.25},800,600)).toEqual({x:200,y:300,width:400,height:150});
  });
});
describe('M3 ROI ranking guardrails',()=>{
  const regs=[region('face')],original={width:1000,height:1000};
  it('accepts meaningful region improvement while global stays within tolerance',()=>{
    expect(assessContentCandidate(candidate(.012,.03),candidate(.0121,.022),regs,50000,false,original).wins).toBe(true);
  });
  it('rejects global regression, region regression and oversize',()=>{
    expect(assessContentCandidate(candidate(.01,.03),candidate(.014,.015),regs,50000,false,original).reason).toBe('global-regression');
    expect(assessContentCandidate(candidate(.01,.03),candidate(.009,.04),regs,50000,false,original).reason).toBe('region-regression');
    expect(assessContentCandidate(candidate(.01,.03),candidate(.009,.01,51000),regs,50000,false,original).reason).toBe('invalid');
    expect(assessContentCandidate(candidate(.01,.03),candidate(.009,.01,48000,800,800),regs,50000,false,original).reason).toBe('invalid');
  });
  it('rejects byte savings without evidence of visual improvement',()=>{
    expect(assessContentCandidate(candidate(.01,.03),candidate(.01,.03,30000),regs,50000,false,original).wins).toBe(false);
  });
});
