import { SyncProtocolError } from "../lib/platform/data/sync-protocol.ts";

const MAX_SKEW_MS = 2 * 60 * 1000;
const textEncoder = new TextEncoder();

function decodeBase64Url(encoded: string): Uint8Array<ArrayBuffer> {
  if (encoded.length < 10 || encoded.length > 200 || !/^[a-zA-Z0-9_-]+$/.test(encoded)) {
    throw new SyncProtocolError(401, "Invalid device signature.");
  }
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const raw = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    return Uint8Array.from(raw, x => x.charCodeAt(0));
  } catch {
    throw new SyncProtocolError(401, "Invalid device signature encoding.");
  }
}

async function sha256Hex(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(content));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export type SignedHeaders = { deviceId: string; nonce: string; timestamp: number; signature: string };

/**
 * Signed request v1: method, path+raw query, timestamp, nonce, SHA-256 body.
 * The origin, cookies, proxy headers and client-provided IP are never trusted.
 */
export async function signedRequestBytes(
  method: string, url: URL, timestamp: number, nonce: string, body: string
): Promise<Uint8Array<ArrayBuffer>> {
  const canonical = ["modu-sync-v1", method.toUpperCase(),
    url.pathname + url.search, String(timestamp), nonce, await sha256Hex(body)].join("\n");
  return textEncoder.encode(canonical);
}

export function readSignedHeaders(request: Request, now = Date.now()): SignedHeaders {
  const deviceId = request.headers.get("x-modu-device") ?? "";
  const nonce = request.headers.get("x-modu-nonce") ?? "";
  const timestampText = request.headers.get("x-modu-timestamp") ?? "";
  const signature = request.headers.get("x-modu-signature") ?? "";
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(deviceId) ||
      !/^[a-zA-Z0-9_-]{22,96}$/.test(nonce) ||
      !/^[1-9][0-9]{12}$/.test(timestampText) ||
      !signature) {
    throw new SyncProtocolError(401, "Missing or malformed device authentication.");
  }
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > MAX_SKEW_MS) {
    throw new SyncProtocolError(401, "Device timestamp outside allowed window.");
  }
  return { deviceId, nonce, timestamp, signature };
}

export async function verifyDeviceSignature(
  request: Request, body: string, publicKeyJson: string,
  fields: SignedHeaders
): Promise<void> {
  let jwk: JsonWebKey;
  try {
    jwk = JSON.parse(publicKeyJson) as JsonWebKey;
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || jwk.d !== undefined) throw new Error("Bad key");
    const key = await crypto.subtle.importKey("jwk", jwk,
      { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const signed = await signedRequestBytes(request.method, new URL(request.url),
      fields.timestamp, fields.nonce, body);
    const verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, key, decodeBase64Url(fields.signature), signed
    );
    if (!verified) throw new Error("Invalid signature");
  } catch {
    throw new SyncProtocolError(401, "Device authorization failed.");
  }
}
