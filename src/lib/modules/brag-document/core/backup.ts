import type { CareerMoment, CareerOutput, FinalizedSnapshot } from './types.ts';
import { CareerValidationError, decodeMoment } from './moments.ts';
import { assertOutputReferences, decodeOutput } from './outputs.ts';
import { decodeFinalizedSnapshot } from './snapshots.ts';

export type CareerBackup = {
  format: 'modu-career-evidence-local';
  version: 3;
  exportedAt: string;
  moments: CareerMoment[];
  outputs: CareerOutput[];
  snapshots: FinalizedSnapshot[];
};

export function emptyCareerBackup(): CareerBackup {
  return {
    format: 'modu-career-evidence-local', version: 3,
    exportedAt: new Date(0).toISOString(),
    moments: [], outputs: [], snapshots: []
  };
}

/** Strict validation before restore, pairing or incoming baseline. */
export function decodeCareerBackup(raw: unknown): CareerBackup {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CareerValidationError('Invalid Career Evidence backup.');
  }
  const doc = raw as Record<string, unknown>;
  if (doc.format !== 'modu-career-evidence-local' || doc.version !== 3 ||
      typeof doc.exportedAt !== 'string' || !Number.isFinite(Date.parse(doc.exportedAt)) ||
      !Array.isArray(doc.moments) || !Array.isArray(doc.outputs) ||
      !Array.isArray(doc.snapshots)) {
    throw new CareerValidationError('Unsupported or incomplete Career Evidence backup.');
  }
  const moments = doc.moments.map(decodeMoment);
  const outputs = doc.outputs.map(decodeOutput);
  const snapshots = doc.snapshots.map(decodeFinalizedSnapshot);
  for (const list of [moments, outputs, snapshots]) {
    if (new Set(list.map(record => record.id)).size !== list.length)
      throw new CareerValidationError('Backup contains duplicate career record IDs.');
  }
  const sourceById = new Map(moments.map(item => [item.id, item]));
  for (const output of outputs) assertOutputReferences(output, moments);
  const docById = new Map(outputs.map(item => [item.id, item]));
  for (const snapshot of snapshots) {
    const parent = docById.get(snapshot.outputId);
    if (!parent || snapshot.outputRevision > parent.revision) {
      throw new CareerValidationError('Finalized version references an unavailable document revision.');
    }
    // Version is a device-local ordinal. UUID is the immutable global identity.
    for (const section of snapshot.sections) {
      if (!sourceById.has(section.momentId)) {
        throw new CareerValidationError('Finalized version references a missing career moment.');
      }
    }
  }
  return {
    format: 'modu-career-evidence-local', version: 3,
    exportedAt: doc.exportedAt, moments, outputs, snapshots
  };
}

export function verifyCareerState(
  moments: CareerMoment[], outputs: CareerOutput[], snapshots: FinalizedSnapshot[]
): CareerBackup {
  return decodeCareerBackup({
    ...emptyCareerBackup(), exportedAt: new Date().toISOString(),
    moments, outputs, snapshots
  });
}
