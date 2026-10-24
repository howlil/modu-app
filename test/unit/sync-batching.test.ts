import { describe, expect, it } from 'vitest';
import { takeSizeBoundedSyncBatch } from '../../src/lib/platform/data/sync-transport.ts';
import { SYNC_MAX_BODY_BYTES } from '../../src/lib/platform/data/sync-protocol.ts';
import type { PendingSyncOperation } from '../../src/lib/platform/data/outbox.ts';

const operation = (i: number, length: number): PendingSyncOperation => ({
  operationId: 'op-' + i, moduleId: 'brag-document',
  deviceId: 'device_primary_12345', entityId: 'output:' + i,
  kind: 'upsert', baseRevision: null,
  payload: { content: 'x'.repeat(length) }, createdAt: 1,
  sequence: i
});

describe('Global Sync bounded batch selection', () => {
  it('preserves order and sends only the largest safe prefix', () => {
    const pending = [operation(1, 90_000), operation(2, 90_000), operation(3, 90_000)];
    const first = takeSizeBoundedSyncBatch(pending);
    expect(first.map(op => op.operationId)).toEqual(['op-1', 'op-2']);
    const envelope = JSON.stringify({ operations: first.map(({ sequence: _seq, ...rest }) => rest) });
    expect(new TextEncoder().encode(envelope).byteLength).toBeLessThanOrEqual(SYNC_MAX_BODY_BYTES);
    expect(takeSizeBoundedSyncBatch(pending.slice(first.length)).map(x => x.operationId))
      .toEqual(['op-3']);
  });
  it('reports a single unsendable operation rather than infinite retries', () => {
    expect(() => takeSizeBoundedSyncBatch([operation(1, 300_000)])).toThrow('Single sync operation');
  });
  it('honors configured budgets and never reorders operations', () => {
    const pending = [operation(1, 8), operation(2, 16), operation(3, 32)];
    const budget = new TextEncoder().encode(JSON.stringify({
      operations: pending.slice(0, 2).map(({ sequence: _seq, ...rest }) => rest)
    })).byteLength;
    expect(takeSizeBoundedSyncBatch(pending, budget)).toEqual(pending.slice(0, 2));
  });
});
