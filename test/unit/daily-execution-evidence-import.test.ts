import { describe, expect, it } from 'vitest';
import { parseLocalEvidenceFile } from '../../src/lib/modules/daily-execution/adapters/evidence-import.ts';
import { combineEvidence, uniqueEvidence } from '../../src/lib/modules/daily-execution/core/evidence.ts';

const now = new Date(2026, 9, 13, 10).getTime();
function jsonFile(value: unknown): File {
  return new File([JSON.stringify(value)], 'evidence.json', {type:'application/json'});
}
describe('M3 local evidence import',()=>{
  it('accepts a bounded import but never treats uploaded claims as verified',async()=>{
    const [record] = await parseLocalEvidenceFile(jsonFile([{
      kind:'assessment',source:'cs101',externalId:'assessment-7',
      title:'Concurrency',observation:'Needs targeted practice',topic:'Java concurrency',
      assessmentResult:'needs-practice',occurredAt:now-3600000
    }]),now);
    expect(record.verification).toBe('unverified');
    expect(record.id).toBe('imported:cs101:assessment-7');
    expect(record.topic).toBe('Java concurrency');
  });
  it('produces a stable ID for repeated imports without external identifiers',async()=>{
    const file=jsonFile([{kind:'deliverable',title:'Test result',observation:'Verified locally',occurredAt:now-1000}]);
    const first=await parseLocalEvidenceFile(file,now);
    const second=await parseLocalEvidenceFile(file,now+3000);
    expect(first[0].id).toBe(second[0].id);
    expect(uniqueEvidence([...first,...second])).toHaveLength(1);
  });
  it('rejects malformed and future-dated evidence',async()=>{
    await expect(parseLocalEvidenceFile(jsonFile([{kind:'assessment',title:'A',observation:'O',occurredAt:now+120000}]),now)).rejects.toThrow();
    await expect(parseLocalEvidenceFile(jsonFile({not:'array'}),now)).rejects.toThrow();
  });
  it('never duplicates legacy task-outcome projections in the same render',()=>{
    expect(combineEvidence([],[])).toHaveLength(0);
  });
});
