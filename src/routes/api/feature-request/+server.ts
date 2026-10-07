import { env } from 'cloudflare:workers';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const repository = 'howlil/modu-app';

type FeatureRequestPayload = {
  title?: unknown;
  details?: unknown;
  website?: unknown;
};

function githubIssueUrl(title: string, body: string) {
  const params = new URLSearchParams({
    title: '[Feature] ' + title,
    body
  });

  return 'https://github.com/' + repository + '/issues/new?' + params.toString();
}

export const POST: RequestHandler = async ({ request, url }) => {
  const origin = request.headers.get('origin');

  if (origin && origin !== url.origin) {
    return json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  let payload: FeatureRequestPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const details = typeof payload.details === 'string' ? payload.details.trim() : '';
  const website = typeof payload.website === 'string' ? payload.website.trim() : '';

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
  const token = (env as { GITHUB_TOKEN?: string }).GITHUB_TOKEN;

  if (!token) {
    return json(
      {
        error: 'Direct GitHub submission is not configured yet.',
        fallbackUrl
      },
      { status: 503 }
    );
  }

  const response = await fetch('https://api.github.com/repos/' + repository + '/issues', {
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

  if (!response.ok) {
    return json(
      {
        error: 'GitHub could not create the issue.',
        fallbackUrl
      },
      { status: 502 }
    );
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
