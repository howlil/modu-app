import { env } from 'cloudflare:workers';
import { json } from '@sveltejs/kit';
import { isAllowedOrigin, verifyTurnstileToken } from '$lib/server/feature-request-security';
import type { RequestHandler } from './$types';

const repository = 'howlil/modu-app';

type RateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

type FeatureRequestEnv = {
  GITHUB_TOKEN?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  FEATURE_REQUEST_IP_LIMITER?: RateLimiter;
  FEATURE_REQUEST_GLOBAL_LIMITER?: RateLimiter;
};

type FeatureRequestPayload = {
  title?: unknown;
  details?: unknown;
  website?: unknown;
  turnstileToken?: unknown;
};

function githubIssueUrl(title: string, body: string) {
  const params = new URLSearchParams({
    title: '[Feature] ' + title,
    body
  });

  return 'https://github.com/' + repository + '/issues/new?' + params.toString();
}

export const GET: RequestHandler = async () => {
  const settings = env as unknown as FeatureRequestEnv;
  const siteKey =
    settings.TURNSTILE_SITE_KEY && settings.TURNSTILE_SECRET_KEY && settings.GITHUB_TOKEN
      ? settings.TURNSTILE_SITE_KEY
      : null;

  return json({ siteKey }, { headers: { 'cache-control': 'no-store' } });
};

export const POST: RequestHandler = async ({ request, url }) => {
  if (!isAllowedOrigin(request.headers.get('origin'), url.origin)) {
    return json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  const settings = env as unknown as FeatureRequestEnv;
  const ipLimiter = settings.FEATURE_REQUEST_IP_LIMITER;
  const globalLimiter = settings.FEATURE_REQUEST_GLOBAL_LIMITER;

  if (!ipLimiter || !globalLimiter) {
    return json({ error: 'Feature requests are temporarily unavailable.' }, { status: 503 });
  }

  const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';

  try {
    const [perIp, global] = await Promise.all([
      ipLimiter.limit({ key: 'feature-request:ip:' + clientIp }),
      globalLimiter.limit({ key: 'feature-request:global' })
    ]);

    if (!perIp.success || !global.success) {
      return json(
        { error: 'Too many requests. Try again later.' },
        { status: 429, headers: { 'retry-after': '60' } }
      );
    }
  } catch {
    return json({ error: 'Feature requests are temporarily unavailable.' }, { status: 503 });
  }

  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: 'Expected JSON request.' }, { status: 415 });
  }

  let payload: FeatureRequestPayload;

  try {
    const body = await request.text();
    if (body.length > 8192) {
      return json({ error: 'Request body is too large.' }, { status: 413 });
    }

    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return json({ error: 'Invalid request body.' }, { status: 400 });
    }
    payload = parsed as FeatureRequestPayload;
  } catch {
    return json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const details = typeof payload.details === 'string' ? payload.details.trim() : '';
  const website = typeof payload.website === 'string' ? payload.website.trim() : '';

  // Keep the honeypot response inert: it must never reach the GitHub API.
  if (website) {
    return json({ ok: true });
  }

  if (!title || title.length > 100 || details.length > 1500) {
    return json({ error: 'Feature request is invalid.' }, { status: 400 });
  }

  const issueBody =
    '### Request\n\n' +
    (details || 'No additional details provided.') +
    '\n\n---\nSubmitted from Modu.';

  const fallbackUrl = githubIssueUrl(title, issueBody);
  const token = settings.GITHUB_TOKEN;
  const secret = settings.TURNSTILE_SECRET_KEY;

  // Never attempt a privileged GitHub write when bot verification isn't configured.
  if (!token || !secret || !settings.TURNSTILE_SITE_KEY) {
    return json(
      { error: 'Direct submissions are unavailable. Open GitHub instead.', fallbackUrl },
      { status: 503 }
    );
  }

  if (typeof payload.turnstileToken !== 'string') {
    return json(
      { error: 'Complete the verification before sending.', fallbackUrl },
      { status: 403 }
    );
  }

  const verified = await verifyTurnstileToken({
    token: payload.turnstileToken,
    secret,
    hostname: url.hostname,
    remoteIp: clientIp === 'unknown' ? undefined : clientIp
  });

  if (!verified) {
    return json(
      { error: 'Verification expired or failed. Please retry.', fallbackUrl },
      { status: 403 }
    );
  }

  let response: Response;

  try {
    response = await fetch('https://api.github.com/repos/' + repository + '/issues', {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: 'Bearer ' + token,
        'content-type': 'application/json',
        'user-agent': 'modu-app',
        'x-github-api-version': '2022-11-28'
      },
      body: JSON.stringify({
        title: '[Feature] ' + title,
        body: issueBody
      })
    });
  } catch {
    return json({ error: 'GitHub could not create the issue.', fallbackUrl }, { status: 502 });
  }

  if (!response.ok) {
    return json({ error: 'GitHub could not create the issue.', fallbackUrl }, { status: 502 });
  }

  const issue = (await response.json()) as {
    html_url?: string;
    number?: number;
  };

  return json({
    ok: true,
    url: issue.html_url ?? fallbackUrl,
    number: issue.number ?? null
  });
};
