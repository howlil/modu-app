import type { SyncStorage } from "./journal.ts";
import { SyncProtocolError } from "../lib/platform/data/sync-protocol.ts";
import type { SyncJournal } from "./journal.ts";

const encoder = new TextEncoder();
const EXPIRE_MS = 5 * 60_000;

export function randomSecret(): string {
  const data = crypto.getRandomValues(new Uint8Array(32));
  let ascii = "";
  for (const item of data) ascii += String.fromCharCode(item);
  return btoa(ascii).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
export async function secretDigest(secret: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new SyncProtocolError(400, "Invalid recovery or invitation key.");
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2,"0")).join("");
}
export function parsePublicJwk(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SyncProtocolError(400, "Invalid device public key.");
  }
  const key = value as Record<string, unknown>;
  if (key.kty !== "EC" || key.crv !== "P-256" || key.d !== undefined ||
      typeof key.x !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(key.x) ||
      typeof key.y !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(key.y)) {
    throw new SyncProtocolError(400, "Device must supply a public ECDSA P-256 key.");
  }
  return JSON.stringify({ kty: "EC", crv: "P-256", x: key.x, y: key.y, ext: true });
}
/** Structural JWK checks alone cannot verify that an EC point lies on P-256. */
export async function validateImportableDeviceKey(identity: { publicKey: string }): Promise<void> {
  try {
    await crypto.subtle.importKey("jwk", JSON.parse(identity.publicKey) as JsonWebKey,
      { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  } catch {
    throw new SyncProtocolError(400, "Device public key is not a valid P-256 point.");
  }
}
export function parseDeviceIdentity(raw: unknown): { deviceId: string; name: string; publicKey: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SyncProtocolError(400, "Invalid device identity.");
  const row = raw as Record<string, unknown>;
  if (typeof row.deviceId !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(row.deviceId) ||
      typeof row.name !== "string" || !row.name.trim() || row.name.trim().length > 60) {
    throw new SyncProtocolError(400, "Invalid device ID or name.");
  }
  return { deviceId: row.deviceId, name: row.name.trim(), publicKey: parsePublicJwk(row.publicKey) };
}
type PairingRow = {
  id: string; expires_at: number; approved_at: number | null;
  candidate_id: string | null; candidate_name: string | null; confirmation: string | null;
  secret_hash: string; candidate_public_key: string | null; used_at: number | null
};
type DeviceRow = { device_id: string; display_name: string; added_at: number; revoked_at: number | null };

export class PairingRegistry {
  constructor(private readonly storage: SyncStorage, private readonly journal: SyncJournal) {
    storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS sync_space_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        recovery_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pairing_invitations (
        id TEXT PRIMARY KEY,
        secret_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        candidate_id TEXT,
        candidate_name TEXT,
        candidate_public_key TEXT,
        confirmation TEXT,
        approved_at INTEGER,
        used_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS pairing_expiry ON pairing_invitations(expires_at);
    `);
  }
  isInitialized(): boolean {
    return this.storage.sql.exec<{ id: number }>("SELECT id FROM sync_space_meta WHERE id = 1").toArray().length > 0;
  }
  bootstrap(identity: ReturnType<typeof parseDeviceIdentity>, recoveryHash: string, now = Date.now()): void {
    this.storage.transactionSync(() => {
      if (this.isInitialized()) throw new SyncProtocolError(409, "Sync space already initialized.");
      this.storage.sql.exec(
        "INSERT INTO sync_space_meta(id, recovery_hash, created_at) VALUES (1, ?, ?)", recoveryHash, now
      );
      this.journal.registerApprovedDevice(identity.deviceId, identity.publicKey, now, identity.name);
    });
  }
  invite(deviceId: string, nonce: string, now = Date.now()) {
    const secret = randomSecret();
    const id = crypto.randomUUID();
    const expiresAt = now + EXPIRE_MS;
    return secretDigest(secret).then(digest =>
      this.journal.authorizedControl(deviceId, nonce, () => {
        this.storage.sql.exec("DELETE FROM pairing_invitations WHERE expires_at < ?", now);
        this.storage.sql.exec(
          "INSERT INTO pairing_invitations(id,secret_hash,expires_at) VALUES(?,?,?)",
          id, digest, expiresAt
        );
        return { invitationId: id, secret, expiresAt };
      })
    );
  }
  private find(invitationId: string, digest: string, now: number): PairingRow {
    if (!/^[a-f0-9-]{36}$/.test(invitationId)) throw new SyncProtocolError(400, "Invalid invitation ID.");
    const row = this.storage.sql.exec<PairingRow>(
      "SELECT * FROM pairing_invitations WHERE id = ?", invitationId
    ).toArray()[0];
    if (!row || row.secret_hash !== digest || row.expires_at <= now) {
      throw new SyncProtocolError(404, "Invitation expired or unavailable.");
    }
    return row;
  }
  async join(
    invitationId: string, secret: string, identity: ReturnType<typeof parseDeviceIdentity>,
    now = Date.now()
  ) {
    const digest = await secretDigest(secret);
    return this.storage.transactionSync(() => {
      const invite = this.find(invitationId, digest, now);
      if (invite.used_at || invite.approved_at || invite.candidate_id) {
        throw new SyncProtocolError(409, "This invitation is no longer available.");
      }
      if (this.journal.deviceExists(identity.deviceId)) {
        throw new SyncProtocolError(409, "Device identity is already registered.");
      }
      const confirmation = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
      this.storage.sql.exec(
        "UPDATE pairing_invitations SET candidate_id=?,candidate_name=?,candidate_public_key=?,confirmation=? WHERE id=?",
        identity.deviceId, identity.name, identity.publicKey, confirmation, invitationId
      );
      return { status: "pending", confirmation };
    });
  }
  inspectInvitation(deviceId: string, nonce: string, invitationId: string, now = Date.now()) {
    return this.journal.authorizedControl(deviceId, nonce, () => {
      const row = this.storage.sql.exec<PairingRow>(
        "SELECT * FROM pairing_invitations WHERE id = ?", invitationId
      ).toArray()[0];
      if (!row || row.expires_at <= now || row.used_at) throw new SyncProtocolError(404, "Invitation unavailable.");
      return {
        status: row.approved_at ? "approved" : row.candidate_id ? "pending-approval" : "awaiting-device",
        confirmation: row.confirmation, candidateName: row.candidate_name,
        expiresAt: row.expires_at
      };
    });
  }
  approve(deviceId: string, nonce: string, invitationId: string, confirmation: string, now = Date.now()) {
    return this.journal.authorizedControl(deviceId, nonce, () => {
      const row = this.storage.sql.exec<PairingRow>(
        "SELECT * FROM pairing_invitations WHERE id = ?", invitationId
      ).toArray()[0];
      if (!row || row.expires_at <= now || row.approved_at || row.used_at ||
          !row.candidate_id || !row.candidate_public_key || row.confirmation !== confirmation) {
        throw new SyncProtocolError(409, "Invalid approval or expired invitation.");
      }
      this.journal.registerApprovedDevice(row.candidate_id, row.candidate_public_key, now, row.candidate_name ?? "Device");
      this.storage.sql.exec(
        "UPDATE pairing_invitations SET approved_at=?,used_at=? WHERE id=?", now, now, invitationId
      );
      return { approved: true };
    });
  }
  async joinStatus(invitationId: string, secret: string, now = Date.now()) {
    const digest = await secretDigest(secret);
    return this.storage.transactionSync(() => {
      const row = this.find(invitationId, digest, now);
      return { status: row.approved_at ? "approved" : row.candidate_id ? "pending-approval" : "awaiting-device" };
    });
  }
  list(deviceId: string, nonce: string) {
    return this.journal.authorizedControl(deviceId, nonce, () => ({
      devices: this.storage.sql.exec<DeviceRow>(
        "SELECT device_id, display_name, added_at, revoked_at FROM devices ORDER BY added_at"
      ).toArray().map(row => ({
        deviceId: row.device_id, name: row.display_name, addedAt: row.added_at,
        revoked: row.revoked_at !== null
      }))
    }));
  }
  revoke(deviceId: string, nonce: string, victimId: string, now = Date.now()) {
    return this.journal.authorizedControl(deviceId, nonce, () => {
      if (deviceId === victimId) throw new SyncProtocolError(409, "Current device must disconnect itself locally.");
      if (!this.journal.deviceExists(victimId)) throw new SyncProtocolError(404, "Device not found.");
      this.journal.revokeDevice(victimId, now);
      return { revoked: true };
    });
  }
  async recover(identity: ReturnType<typeof parseDeviceIdentity>, recoverySecret: string, now = Date.now()) {
    const digest = await secretDigest(recoverySecret);
    const rotated = randomSecret(), rotatedHash = await secretDigest(rotated);
    return this.storage.transactionSync(() => {
      const row = this.storage.sql.exec<{ recovery_hash: string }>(
        "SELECT recovery_hash FROM sync_space_meta WHERE id = 1"
      ).toArray()[0];
      if (!row || row.recovery_hash !== digest || this.journal.deviceExists(identity.deviceId)) {
        throw new SyncProtocolError(401, "Invalid recovery authorization.");
      }
      this.journal.registerApprovedDevice(identity.deviceId, identity.publicKey, now, identity.name);
      this.storage.sql.exec(
        "UPDATE sync_space_meta SET recovery_hash=? WHERE id=1", rotatedHash
      );
      return { recovered: true, recoveryKey: rotated };
    });
  }
}
