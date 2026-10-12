import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEvidenceRecords, saveEvidenceRecords } from '../../src/lib/modules/daily-execution/adapters/evidence-storage.ts';
import type { EvidenceRecord } from '../../src/lib/modules/daily-execution/core/evidence.ts';

const entry: EvidenceRecord = {
  id:'e1', kind:'deliverable', source:'manual', title:'Callback test', observation:'Tests passed',
  occurredAt:123456,verification:'user-reported'
};
afterEach(()=>vi.unstubAllGlobals());
function localMemory() {
  const cache = new Map<string,string>();
  vi.stubGlobal('indexedDB', undefined);
  vi.stubGlobal('localStorage',{
    getItem:(key:string)=>cache.get(key)??null,
    setItem:(key:string,value:string)=>{cache.set(key,value)},
    removeItem:(key:string)=>cache.delete(key)
  });
}
describe('M3 evidence repository compatibility',()=>{
  it('reads and updates an existing record without adding a duplicate',async()=>{
    localMemory();
    await saveEvidenceRecords([entry]);
    await saveEvidenceRecords([{...entry,title:'Updated callback test'}]);
    const saved=await loadEvidenceRecords();
    expect(saved).toHaveLength(1);
    expect(saved[0].title).toBe('Updated callback test');
  });
  it('keeps archived evidence restorable using the same identity',async()=>{
    localMemory();
    await saveEvidenceRecords([{...entry,archivedAt:1000}]);
    expect((await loadEvidenceRecords())[0].archivedAt).toBe(1000);
    await saveEvidenceRecords([{...entry}]);
    expect((await loadEvidenceRecords())[0].archivedAt).toBeUndefined();
  });
});
