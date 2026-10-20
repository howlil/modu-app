import { RemoteApplyConflict } from "./inbox.ts";

/** Stable, user-actionable failure categories. Never suggest destructive auto-merge. */
export function explainSyncFailure(cause: unknown): string {
  if (cause instanceof RemoteApplyConflict ||
      (cause instanceof Error && /concurrent|conflict|immutable|baseline|revision|manual merge/i.test(cause.message))) {
    return "Sync paused: this browser has changes that cannot be merged automatically. Export a global backup before resolving the conflicting module. No data was silently overwritten.";
  }
  if (!(cause instanceof Error)) return "Sync failed. Your local data remains stored. Retry when the connection is available.";
  const error = cause.message;
  if (/\(401\)|\(403\)|not authorized|revoked|not paired/i.test(error)) {
    return "This device no longer has sync access. Recovery rotates credentials and revokes old devices; local data is retained.";
  }
  if (/\(507\)|retention limit|space has reached/i.test(error)) {
    return "Cloud sync storage reached its safe retention limit. Export a global backup. Pending local changes remain queued; further cloud writes are paused.";
  }
  if (/\(413\)|payload size|exceeds.*limit|too large|256 KiB/i.test(error)) {
    return "This sync payload is larger than the current protocol supports. Export a backup; large-history chunked sync is not available yet.";
  }
  if (/\(429\)|too many pairing attempts/i.test(error)) {
    return "Request rate limit reached. Try again later. Existing local data is unaffected.";
  }
  if (/\(503\)|\(504\)|network|connection|fetch failed|offline/i.test(error)) {
    return "Cloud service or network unavailable. Nothing was discarded locally; retry Sync now when connectivity returns.";
  }
  if (/quota|indexeddb|browser storage|blocked/i.test(error)) {
    return "Browser storage is unavailable or full. Free space or close other Modu tabs, then retry. Do not clear site data before exporting a backup.";
  }
  return error;
}
