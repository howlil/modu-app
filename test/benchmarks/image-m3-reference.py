#!/usr/bin/env python3
"""Independent M3 reference quality audit (aligned 256px global and ROI PNG pairs)."""
import json,math,re,subprocess,sys
from pathlib import Path

def ssim(reference:Path,compressed:Path)->float:
    proc=subprocess.run(['ssimulacra2_rs','image',str(reference),str(compressed)],
        capture_output=True,text=True,check=True,timeout=45)
    output=(proc.stdout+'\n'+proc.stderr).strip()
    vals=re.findall(r'[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?',output)
    if not vals:raise RuntimeError('Unparseable reference result '+output[:250])
    n=float(vals[-1])
    if not math.isfinite(n) or n>100.01:raise RuntimeError('Invalid SSIMULACRA2 score')
    return n

def run(root:Path)->dict:
    result={'metric':'SSIMULACRA2 reference','comparison':'256px equal-display geometry',
      'samples':[],'summary':{}}
    for folder in sorted(root.glob('image-m3-*')):
      manifest=folder/'results.json'
      if not manifest.exists():continue
      rows=json.loads(manifest.read_text()).get('results',[])
      lookup={ref:row for row in rows for ref in row.get('referenceIds',[])}
      for original in sorted((folder/'reference').glob('*-original.png')):
        token=original.name.removesuffix('-original.png')
        before=original.with_name(token+'-baseline.png')
        after=original.with_name(token+'-optimized.png')
        if not before.exists() or not after.exists():raise FileNotFoundError(token)
        b=ssim(original,before)
        a=ssim(original,after)
        record={'fixture':folder.name,'sample':token,'kind':'roi' if token.endswith('-roi') else 'global',
          'claimedImprovement':bool(lookup.get(token,{}).get('improved')),
          'before':b,'after':a,'delta':round(a-b,4)}
        result['samples'].append(record)
    samples=result['samples']
    if not samples:raise RuntimeError('No M3 reference samples')
    flagged=[r for r in samples if r['claimedImprovement'] and r['delta'] < -0.5]
    result['summary']={'samples':len(samples),
      'globalSamples':sum(r['kind']=='global' for r in samples),
      'roiSamples':sum(r['kind']=='roi' for r in samples),
      'claimedImprovements':sum(r['claimedImprovement'] for r in samples),
      'meanGlobalDelta':round(sum(r['delta'] for r in samples if r['kind']=='global')/
        max(1,sum(r['kind']=='global' for r in samples)),4),
      'meanROIDelta':round(sum(r['delta'] for r in samples if r['kind']=='roi')/
        max(1,sum(r['kind']=='roi' for r in samples)),4),
      'regressionsOutsideTolerance':len(flagged),
      'worstDelta':min(r['delta'] for r in samples)}
    return result

if __name__=='__main__':
  report=run(Path(sys.argv[1] if len(sys.argv)>1 else 'm3-artifacts'))
  Path('m3-reference-report.json').write_text(json.dumps(report,indent=2)+'\n')
  print(json.dumps(report['summary'],indent=2))
  if report['summary']['regressionsOutsideTolerance']:
    raise SystemExit('M3 ROI/global quality regression gate failed: >0.5 SSIMULACRA2 point drop')
  print('M3 independent quality gate passed')
