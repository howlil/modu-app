import { SyncProtocolError, SYNC_MAX_BODY_BYTES } from "./sync-protocol.ts";

/**
 * Stream-bounded JSON read. Content-Length may be absent or client-controlled;
 * avoid unbounded request.text() allocations in the public Worker/DO boundary.
 */
export async function readLimitedSyncBody(
  request: Request, maxBytes = SYNC_MAX_BODY_BYTES
): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("Sync request too large.");
        throw new SyncProtocolError(413, "Sync request exceeds the size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(output);
  } catch {
    throw new SyncProtocolError(400, "Sync JSON must be valid UTF-8.");
  }
}
