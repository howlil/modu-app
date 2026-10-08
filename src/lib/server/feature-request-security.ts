export const TURNSTILE_ACTION = 'feature_request';

export function isAllowedOrigin(origin: string | null, expectedOrigin: string): boolean {
  return origin === expectedOrigin;
}

export async function verifyTurnstileToken({
  token,
  secret,
  hostname,
  remoteIp,
  fetcher = fetch
}: {
  token: string;
  secret: string;
  hostname: string;
  remoteIp?: string;
  fetcher?: typeof fetch;
}): Promise<boolean> {
  if (!token || token.length > 2048 || !secret || !hostname) {
    return false;
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }

  try {
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!response.ok) {
      return false;
    }

    const result: unknown = await response.json();
    if (typeof result !== 'object' || result === null) {
      return false;
    }

    const verdict = result as Record<string, unknown>;
    return (
      verdict.success === true &&
      verdict.hostname === hostname &&
      verdict.action === TURNSTILE_ACTION
    );
  } catch {
    // Fail closed if Cloudflare's verification service cannot be reached.
    return false;
  }
}
