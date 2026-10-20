// @ts-nocheck — Node.js subprocess integration smoke executes outside the browser TypeScript target.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { randomBytes, randomUUID, webcrypto } from "node:crypto";

const CRYPTO = globalThis.crypto ?? webcrypto;
const origin = "http://127.0.0.1:8795";
const spaceId = randomUUID();
const base = origin + "/api/sync/spaces/" + spaceId;
const deviceId = "device_runtime_00001";

let processHandle;
let logs = "";
async function boot(directory) {
  const args = ["wrangler", "dev", "--config", "wrangler.sync.test.jsonc",
    "--port", "8795", "--ip", "127.0.0.1", "--local", "--persist-to", directory];
  processHandle = spawn("bunx", args, { stdio: ["ignore", "pipe", "pipe"], detached: true });
  for (const stream of [processHandle.stdout, processHandle.stderr]) {
    stream.on("data", chunk => { logs = (logs + String(chunk)).slice(-20_000); });
  }
  for (let n = 0; n < 160; n++) {
    if (processHandle.exitCode !== null) throw new Error("workerd terminated during startup\n" + logs);
    try {
      const res = await fetch(origin + "/__health", { signal: AbortSignal.timeout(1000) });
      if (res.ok && await res.text() === "ready") return;
    } catch {}
    await sleep(250);
  }
  throw new Error("Local Cloudflare Worker did not start\n" + logs);
}
async function shutdown() {
  if (!processHandle) return;
  const child = processHandle;
  processHandle = undefined;
  try { process.kill(-child.pid, "SIGTERM"); }
  catch { try { child.kill("SIGTERM"); } catch {} }
  for (let n = 0; n < 60 && child.exitCode === null; n++) await sleep(100);
  if (child.exitCode === null) {
    try { process.kill(-child.pid, "SIGKILL"); } catch {}
  }
}
function b64(buffer) { return Buffer.from(buffer).toString("base64url"); }
async function signed(method, route, key, payload = "", nonce = b64(randomBytes(24))) {
  const timestamp = Date.now();
  const url = new URL(route);
  const hash = await CRYPTO.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const bodyHash = Buffer.from(hash).toString("hex");
  const message = ["modu-sync-v1", method, url.pathname + url.search, String(timestamp), nonce, bodyHash].join("\n");
  const signature = await CRYPTO.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(message)
  );
  return {
    method,
    headers: {
      "x-modu-device": deviceId,
      "x-modu-timestamp": String(timestamp),
      "x-modu-nonce": nonce,
      "x-modu-signature": b64(signature),
      ...(method === "POST" ? { "content-type": "application/json" } : {})
    },
    ...(method === "POST" ? { body: payload } : {})
  };
}
const tmp = await mkdtemp(join(tmpdir(), "modu-sync-workerd-"));
try {
  await boot(tmp);
  const keys = await CRYPTO.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]
  );
  const identity = {
    deviceId, name: "Integration test browser",
    publicKey: await CRYPTO.subtle.exportKey("jwk", keys.publicKey)
  };
  const recovered = b64(randomBytes(32));
  const init = await fetch(origin + "/api/sync/initialize/" + spaceId, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity, recoveryKey: recovered })
  });
  assert.equal(init.status, 201, "Cloudflare DO should bootstrap a private space");
  assert.equal((await fetch(base + "/changes?after=0")).status, 401,
    "Unauthorized device must be rejected by real workerd");

  const op = {
    operationId: "runtime-op-1", deviceId, moduleId: "pomodoro",
    entityId: "focus-runtime-1", kind: "upsert", baseRevision: null,
    payload: { session: { id: "focus-runtime-1", note: "runtime" } },
    createdAt: Date.now()
  };
  const body = JSON.stringify({ operations: [op] });
  const push = await fetch(base + "/changes", await signed("POST", base + "/changes", keys.privateKey, body));
  assert.equal(push.status, 200, "Signed write should be committed in real SQLite");
  assert.deepEqual((await push.json()).accepted, [{ operationId: op.operationId, sequence: 1 }]);

  const nonce = b64(randomBytes(24));
  const url = base + "/changes?after=0&limit=50";
  const first = await fetch(url, await signed("GET", url, keys.privateKey, "", nonce));
  assert.equal(first.status, 200);
  const beforeRestart = await first.json();
  assert.equal(beforeRestart.operations.length, 1);
  assert.equal(beforeRestart.nextCursor, 1);
  const replay = await fetch(url, await signed("GET", url, keys.privateKey, "", nonce));
  assert.equal(replay.status, 409, "Nonce replay must be rejected by real SQLite");

  await shutdown();
  await sleep(500);
  await boot(tmp);
  const persisted = await fetch(url, await signed("GET", url, keys.privateKey));
  assert.equal(persisted.status, 200);
  assert.deepEqual((await persisted.json()).operations.map(x => x.operationId),
    ["runtime-op-1"], "Journal must survive an actual workerd restart");
  const retry = await fetch(base + "/changes",
    await signed("POST", base + "/changes", keys.privateKey, body));
  assert.equal(retry.status, 200);
  assert.deepEqual((await retry.json()).accepted, [{ operationId: op.operationId, sequence: 1 }],
    "Committed operation must be idempotent across workerd restarts");
  process.stdout.write("Cloudflare workerd SQLite integration passed: signed push/pull, auth, replay, restart durability.\n");
} catch (error) {
  process.stderr.write("Cloudflare workerd M6 smoke failed: " + String(error) + "\n");
  process.stderr.write(logs.slice(-3500) + "\n");
  process.exitCode = 1;
} finally {
  await shutdown();
  await rm(tmp, { recursive: true, force: true });
}
