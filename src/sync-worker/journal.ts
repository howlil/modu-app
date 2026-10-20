import type {
  SequencedSyncOperation, SyncPullReply, SyncPushReply, WireSyncOperation
} from "../lib/platform/data/sync-protocol.ts";
import { SyncProtocolError } from "../lib/platform/data/sync-protocol.ts";

export type SqlValue = string | number | boolean | Uint8Array | null;
export interface SqlResult<T> { toArray(): T[] }
export interface SyncSql {
  exec<T = Record<string, unknown>>(sql: string, ...parameters: SqlValue[]): SqlResult<T>;
}
export interface SyncStorage {
  sql: SyncSql;
  transactionSync<T>(callback: () => T): T;
}

type DeviceRow = { public_key: string; revoked_at: number | null };
type SequenceRow = { seq: number; device_id: string; body: string };
type CountRow = { count: number };

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    public_key TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    revoked_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS used_nonces (
    device_id TEXT NOT NULL,
    nonce TEXT NOT NULL,
    issued_at INTEGER NOT NULL,
    PRIMARY KEY (device_id, nonce)
  );
  CREATE INDEX IF NOT EXISTS nonces_age ON used_nonces(issued_at);
  CREATE TABLE IF NOT EXISTS operations (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id TEXT NOT NULL UNIQUE,
    device_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    committed_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS operations_device ON operations(device_id, seq);
`;

/** Trust boundary: callers authenticate device signatures before invoking push/pull. */
export class SyncJournal {
  constructor(private readonly storage: SyncStorage) {
    storage.sql.exec(SCHEMA);
  }

  getActiveDevice(deviceId: string): string | null {
    const row = this.storage.sql.exec<DeviceRow>(
      "SELECT public_key, revoked_at FROM devices WHERE device_id = ?", deviceId
    ).toArray()[0];
    return row && row.revoked_at === null ? row.public_key : null;
  }

  /**
   * Internal trusted enrollment primitive for the M5 approved-pairing flow.
   * This is deliberately NOT reachable over an HTTP route in M4.
   */
  registerApprovedDevice(deviceId: string, publicKeyJson: string, at = Date.now()): void {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(deviceId) ||
        typeof publicKeyJson !== "string" || publicKeyJson.length > 4096) {
      throw new SyncProtocolError(400, "Invalid device enrollment.");
    }
    this.storage.transactionSync(() => {
      const existing = this.storage.sql.exec<DeviceRow>(
        "SELECT public_key, revoked_at FROM devices WHERE device_id = ?", deviceId
      ).toArray()[0];
      if (existing) throw new SyncProtocolError(409, "Device identity already registered.");
      this.storage.sql.exec(
        "INSERT INTO devices(device_id, public_key, added_at) VALUES(?, ?, ?)",
        deviceId, publicKeyJson, at
      );
    });
  }

  /** Revocation is permanent for this device key; re-enrollment requires a new ID. */
  revokeDevice(deviceId: string, at = Date.now()): void {
    this.storage.sql.exec(
      "UPDATE devices SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL",
      at, deviceId
    );
  }

  private claimNonce(deviceId: string, nonce: string, now: number): void {
    // Retain more than the full timestamp-validity window.
    this.storage.sql.exec("DELETE FROM used_nonces WHERE issued_at < ?", now - 10 * 60_000);
    const existing = this.storage.sql.exec<{ nonce: string }>(
      "SELECT nonce FROM used_nonces WHERE device_id = ? AND nonce = ?",
      deviceId, nonce
    ).toArray()[0];
    if (existing) throw new SyncProtocolError(409, "Request nonce was already used.");
    this.storage.sql.exec(
      "INSERT INTO used_nonces(device_id, nonce, issued_at) VALUES(?, ?, ?)",
      deviceId, nonce, now
    );
  }

  accept(
    deviceId: string, nonce: string, operations: WireSyncOperation[], now = Date.now()
  ): SyncPushReply {
    return this.storage.transactionSync(() => {
      if (!this.getActiveDevice(deviceId)) throw new SyncProtocolError(401, "Device is not authorized.");
      this.claimNonce(deviceId, nonce, now);
      const accepted: SyncPushReply["accepted"] = [];
      for (const operation of operations) {
        if (operation.deviceId !== deviceId) throw new SyncProtocolError(401, "Operation device mismatch.");
        const body = JSON.stringify(operation);
        const existing = this.storage.sql.exec<SequenceRow>(
          "SELECT seq, device_id, body FROM operations WHERE operation_id = ?",
          operation.operationId
        ).toArray()[0];
        if (existing) {
          if (existing.device_id !== deviceId || existing.body !== body) {
            throw new SyncProtocolError(409, "Operation ID was reused for different data.");
          }
          accepted.push({ operationId: operation.operationId, sequence: existing.seq });
          continue;
        }
        this.storage.sql.exec(
          "INSERT INTO operations(operation_id,device_id,module_id,entity_id,kind,body,created_at,committed_at) VALUES(?,?,?,?,?,?,?,?)",
          operation.operationId, deviceId, operation.moduleId, operation.entityId,
          operation.kind, body, operation.createdAt, now
        );
        const saved = this.storage.sql.exec<SequenceRow>(
          "SELECT seq, device_id, body FROM operations WHERE operation_id = ?", operation.operationId
        ).toArray()[0];
        if (!saved) throw new Error("Durable journal did not persist the operation.");
        accepted.push({ operationId: operation.operationId, sequence: saved.seq });
      }
      return { accepted };
    });
  }

  changes(deviceId: string, nonce: string, after: number, limit: number, now = Date.now()): SyncPullReply {
    return this.storage.transactionSync(() => {
      if (!this.getActiveDevice(deviceId)) throw new SyncProtocolError(401, "Device is not authorized.");
      this.claimNonce(deviceId, nonce, now);
      const rows = this.storage.sql.exec<{ seq: number; body: string }>(
        "SELECT seq, body FROM operations WHERE seq > ? ORDER BY seq ASC LIMIT ?",
        after, limit
      ).toArray();
      const operations: SequencedSyncOperation[] = rows.map(row => {
        if (!Number.isSafeInteger(row.seq) || row.seq <= 0) {
          throw new Error("Invalid sync sequence stored in SQLite.");
        }
        const parsed = JSON.parse(row.body) as WireSyncOperation;
        return { ...parsed, sequence: row.seq };
      });
      const nextCursor = operations.at(-1)?.sequence ?? after;
      const remaining = this.storage.sql.exec<CountRow>(
        "SELECT COUNT(*) AS count FROM operations WHERE seq > ?", nextCursor
      ).toArray()[0]?.count ?? 0;
      return { operations, nextCursor, hasMore: remaining > 0 };
    });
  }
}
