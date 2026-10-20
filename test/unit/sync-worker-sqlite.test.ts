import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { SyncSpace } from "../../src/sync-worker/sync-space.ts";
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
  return Buffer.from(data).toString("base64url");
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
  method: "GET" | "POST",
  url: string,
  data = "",
  forcedNonce?: string
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
      "x-modu-device": device,
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
