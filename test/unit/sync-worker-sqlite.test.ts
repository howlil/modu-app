// @ts-nocheck — Node SQLite integration test runs in Vitest; browser tsconfig intentionally excludes Node types.
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { SyncSpaceHandler as SyncSpace } from "../../src/sync-worker/sync-space.ts";
import { SyncJournal, type SyncStorage, type SqlValue } from "../../src/sync-worker/journal.ts";
import { signedRequestBytes } from "../../src/sync-worker/signature.ts";

const SPACE = "00000000-1111-4222-8333-444444444444";
const ROUTE = "https://modu.example/api/sync/spaces/" + SPACE + "/changes";
const device = "device-test-0001";
let databases: DatabaseSync[] = [];

function createStorage(): SyncStorage {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  return {
    sql: {
      exec(query: string, ...args: SqlValue[]) {
        if (query.includes(";") && args.length === 0) {
          db.exec(query);
          return { toArray: () => [] };
        }
        const stmt = db.prepare(query);
        if (stmt.columns().length) {
          return { toArray: () => stmt.all(...args) };
        }
        stmt.run(...args);
        return { toArray: () => [] };
      }
    },
    transactionSync(fn) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = fn();
        db.exec("COMMIT");
        return result;
      } catch (cause) {
        db.exec("ROLLBACK");
        throw cause;
      }
    }
  };
}

function encode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function credential() {
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]
  );
  return {
    privateKey: keys.privateKey,
    jwk: JSON.stringify(await crypto.subtle.exportKey("jwk", keys.publicKey))
  };
}

async function signed(
  privateKey: CryptoKey,
  method: "GET" | "POST" | "DELETE",
  url: string,
  data = "",
  forcedNonce?: string,
  actorId = device
) {
  const timestamp = Date.now();
  const nonce = forcedNonce ?? encode(crypto.getRandomValues(new Uint8Array(24)));
  const bytes = await signedRequestBytes(method, new URL(url), timestamp, nonce, data);
  const signature = encode(new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, privateKey, bytes
  )));
  return new Request(url, {
    method,
    headers: {
      "x-modu-device": actorId,
      "x-modu-nonce": nonce,
      "x-modu-timestamp": String(timestamp),
      "x-modu-signature": signature,
      ...(method === "POST" ? { "content-type": "application/json" } : {})
    },
    body: method === "POST" ? data : undefined
  });
}

const op = (id: string, payload: unknown = { title: "Example" }) => ({
  operationId: id, moduleId: "habit-tracker", deviceId: device, entityId: "habit-1",
  kind: "upsert", baseRevision: null, payload, createdAt: 1792520000000
});

afterEach(() => {
  for (const db of databases) db.close();
  databases = [];
});

describe("Cloudflare SQLite-backed SyncSpace journal", () => {
  it("has no public enrollment endpoint and refuses devices not enrolled", async () => {
    const storage = createStorage();
    const space = new SyncSpace({ storage });
    const keys = await credential();
    const input = await signed(keys.privateKey, "GET", ROUTE + "?after=0");
    expect((await space.fetch(input)).status).toBe(401);
    expect((await space.fetch(new Request("https://modu.example/internal/provision"))).status).toBe(404);
  });

  it("commits push then returns ordered incremental changes", async () => {
    const storage = createStorage();
    const journal = new SyncJournal(storage);
    const keys = await credential();
    journal.registerApprovedDevice(device, keys.jwk);
    const space = new SyncSpace({ storage });
    const body = JSON.stringify({ operations: [op("op-one"), op("op-two", { title: "Second" })] });
    const push = await space.fetch(await signed(keys.privateKey, "POST", ROUTE, body));
    expect(push.status).toBe(200);
    const accepted = (await push.json()) as { accepted: { operationId: string; sequence: number }[] };
    expect(accepted.accepted.map(row => row.sequence)).toEqual([1, 2]);
    const pull = await space.fetch(await signed(keys.privateKey, "GET", ROUTE + "?after=0&limit=1"));
    expect(pull.status).toBe(200);
    expect(await pull.json()).toMatchObject({
      operations: [{ sequence: 1, operationId: "op-one" }], nextCursor: 1, hasMore: true
    });
    const more = await space.fetch(await signed(keys.privateKey, "GET", ROUTE + "?after=1&limit=50"));
    expect(await more.json()).toMatchObject({
      operations: [{ sequence: 2, operationId: "op-two" }], nextCursor: 2, hasMore: false
    });
  });

  it("is idempotent for retry with a different request nonce, without a new sequence", async () => {
    const storage = createStorage();
    const journal = new SyncJournal(storage);
    const keys = await credential();
    journal.registerApprovedDevice(device, keys.jwk);
    const space = new SyncSpace({ storage });
    const body = JSON.stringify({ operations: [op("op-retry")] });
    const first = await space.fetch(await signed(keys.privateKey, "POST", ROUTE, body));
    const second = await space.fetch(await signed(keys.privateKey, "POST", ROUTE, body));
    expect(await second.json()).toEqual(await first.json());
    const pull = await space.fetch(await signed(keys.privateKey, "GET", ROUTE + "?after=0"));
    expect(((await pull.json()) as { operations: unknown[] }).operations).toHaveLength(1);
  });

  it("rejects nonce replay, invalid signatures and revoked credentials", async () => {
    const storage = createStorage();
    const journal = new SyncJournal(storage);
    const keys = await credential();
    journal.registerApprovedDevice(device, keys.jwk);
    const space = new SyncSpace({ storage });
    const nonce = encode(crypto.getRandomValues(new Uint8Array(24)));
    expect((await space.fetch(await signed(keys.privateKey, "GET", ROUTE, "", nonce))).status).toBe(200);
    expect((await space.fetch(await signed(keys.privateKey, "GET", ROUTE, "", nonce))).status).toBe(409);
    const attacker = await credential();
    expect((await space.fetch(await signed(attacker.privateKey, "GET", ROUTE))).status).toBe(401);
    journal.revokeDevice(device);
    expect((await space.fetch(await signed(keys.privateKey, "GET", ROUTE))).status).toBe(401);
  });

  it("rolls back a multi-operation batch if one operation reuses an ID with altered payload", async () => {
    const storage = createStorage();
    const journal = new SyncJournal(storage);
    const keys = await credential();
    journal.registerApprovedDevice(device, keys.jwk);
    const space = new SyncSpace({ storage });
    const first = await space.fetch(await signed(keys.privateKey, "POST", ROUTE,
      JSON.stringify({ operations: [op("known")] })));
    expect(first.status).toBe(200);
    const bad = await space.fetch(await signed(keys.privateKey, "POST", ROUTE, JSON.stringify({
      operations: [op("new-then-rollback"), op("known", { title: "Tampered" })]
    })));
    expect(bad.status).toBe(409);
    const pull = await space.fetch(await signed(keys.privateKey, "GET", ROUTE + "?after=0"));
    expect(((await pull.json()) as { operations: Array<{ operationId: string }> }).operations
      .map(x => x.operationId)).toEqual(["known"]);
  });

  it("rejects malformed queries and mismatched operation device IDs without persistence", async () => {
    const storage = createStorage();
    const journal = new SyncJournal(storage);
    const keys = await credential();
    journal.registerApprovedDevice(device, keys.jwk);
    const space = new SyncSpace({ storage });
    const badPull = await space.fetch(await signed(keys.privateKey, "GET", ROUTE + "?after=-1"));
    expect(badPull.status).toBe(400);
    const badPush = await space.fetch(await signed(keys.privateKey, "POST", ROUTE,
      JSON.stringify({ operations: [{ ...op("alien"), deviceId: "other-device" }] })));
    expect(badPush.status).toBe(400);
    const pull = await space.fetch(await signed(keys.privateKey, "GET", ROUTE + "?after=0"));
    expect(((await pull.json()) as { operations: unknown[] }).operations).toHaveLength(0);
  });
});

describe("M5 pairing and recovery in real SQLite", () => {
  const base = "https://modu.example/api/sync/spaces/" + SPACE;
  const bootstrapPath = "https://modu.example/api/sync/initialize/" + SPACE;
  const ownerBody = (keys: { jwk: string }, id = device) => ({
    deviceId: id, name: "Main laptop", publicKey: JSON.parse(keys.jwk)
  });
  async function bootstrap(space: SyncSpace, keys: { jwk: string }, recoveryKey: string) {
    return space.fetch(new Request(bootstrapPath, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ identity: ownerBody(keys), recoveryKey })
    }));
  }
  it("initializes only once and never re-enrolls owner by guessing the space ID", async () => {
    const storage = createStorage();
    const space = new SyncSpace({ storage });
    const owner = await credential();
    const recoveryKey = encode(crypto.getRandomValues(new Uint8Array(32)));
    expect((await bootstrap(space, owner, recoveryKey)).status).toBe(201);
    expect((await bootstrap(space, owner, recoveryKey)).status).toBe(409);
    const impostor = await credential();
    const request = await signed(impostor.privateKey, "GET", base + "/devices");
    expect((await space.fetch(request)).status).toBe(401);
  });

  it("requires existing signed approval, one-time secret, and human confirmation", async () => {
    const storage = createStorage();
    const space = new SyncSpace({ storage });
    const owner = await credential();
    const recoveryKey = encode(crypto.getRandomValues(new Uint8Array(32)));
    expect((await bootstrap(space, owner, recoveryKey)).status).toBe(201);
    const inviteReq = await signed(owner.privateKey, "POST", base + "/pairings", "{}");
    const issued = await space.fetch(inviteReq);
    expect(issued.status).toBe(201);
    const invite = await issued.json() as { invitationId: string; secret: string };
    const phone = await credential();
    const phoneId = "device-second-0002";
    const phoneBody = JSON.stringify({ secret: invite.secret, identity: {
      deviceId: phoneId, name: "Phone", publicKey: JSON.parse(phone.jwk)
    } });
    const url = base + "/pairings/" + invite.invitationId;
    const join = await space.fetch(new Request(url + "/join", {
      method: "POST", headers: { "content-type": "application/json" }, body: phoneBody
    }));
    expect(join.status).toBe(200);
    const pending = await join.json() as { confirmation: string; status: string };
    expect(pending.status).toBe("pending");
    expect(pending.confirmation).toMatch(/^[0-9]{6}$/);
    expect((await space.fetch(await signed(phone.privateKey, "GET", base + "/devices", "", undefined, phoneId))).status).toBe(401);
    const approveBad = await space.fetch(await signed(owner.privateKey, "POST", url + "/approve",
      JSON.stringify({ confirmation: "9999999" })));
    expect(approveBad.status).toBe(400);
    const approve = await space.fetch(await signed(owner.privateKey, "POST", url + "/approve",
      JSON.stringify({ confirmation: pending.confirmation })));
    expect(approve.status).toBe(200);
    expect((await space.fetch(await signed(phone.privateKey, "GET", base + "/devices", "", undefined, phoneId))).status).toBe(200);
    const replay = await space.fetch(new Request(url + "/join", {
      method: "POST", headers: { "content-type": "application/json" }, body: phoneBody
    }));
    expect(replay.status).toBe(409);
    const revoked = await space.fetch(await signed(owner.privateKey, "DELETE", base + "/devices/" + phoneId));
    expect(revoked.status).toBe(200);
    expect((await space.fetch(await signed(phone.privateKey, "GET", base + "/devices", "", undefined, phoneId))).status).toBe(401);
  });

  it("rotates the recovery key atomically and invalidates the previous one", async () => {
    const storage = createStorage();
    const space = new SyncSpace({ storage });
    const owner = await credential();
    const initial = encode(crypto.getRandomValues(new Uint8Array(32)));
    await bootstrap(space, owner, initial);
    const laptop = await credential();
    const candidate = { deviceId: "device-recovery-0002", name: "Restored browser",
      publicKey: JSON.parse(laptop.jwk) };
    const body = JSON.stringify({ identity: candidate, recoveryKey: initial });
    const first = await space.fetch(new Request(base + "/recover", {
      method: "POST", headers: { "content-type": "application/json" }, body
    }));
    expect(first.status).toBe(200);
    const rotated = (await first.json()) as { recoveryKey: string };
    expect(rotated.recoveryKey).not.toBe(initial);
    const repeated = await space.fetch(new Request(base + "/recover", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ identity: { ...candidate, deviceId: "device-recovery-0003" }, recoveryKey: initial })
    }));
    expect(repeated.status).toBe(401);
    expect((await space.fetch(await signed(laptop.privateKey, "GET", base + "/devices", "", undefined, candidate.deviceId))).status).toBe(200);
  });

  it("does not accept second join before the initial request is approved", async () => {
    const storage = createStorage();
    const space = new SyncSpace({ storage });
    const owner = await credential();
    await bootstrap(space, owner, encode(crypto.getRandomValues(new Uint8Array(32))));
    const invitation = await space.fetch(await signed(owner.privateKey, "POST", base + "/pairings", "{}"));
    const invite = await invitation.json() as { invitationId: string; secret: string };
    const url = base + "/pairings/" + invite.invitationId + "/join";
    const candidate = await credential();
    const joinBody = JSON.stringify({ secret: invite.secret, identity: ownerBody(candidate, "device-second-0002") });
    expect((await space.fetch(new Request(url, { method: "POST", headers: {"content-type":"application/json"}, body: joinBody }))).status).toBe(200);
    expect((await space.fetch(new Request(url, { method: "POST", headers: {"content-type":"application/json"}, body: joinBody }))).status).toBe(409);
  });
});
