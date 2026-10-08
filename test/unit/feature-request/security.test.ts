import { describe, expect, it, vi } from 'vitest';
import { isAllowedOrigin, verifyTurnstileToken } from '../../../src/lib/server/feature-request-security';

describe('feature request security', () => {
  it('requires the exact Origin (including rejecting a missing Origin)', () => {
    expect(isAllowedOrigin(null, 'https://modu.howlil.site')).toBe(false);
    expect(isAllowedOrigin('https://evil.example', 'https://modu.howlil.site')).toBe(false);
    expect(isAllowedOrigin('https://modu.howlil.site', 'https://modu.howlil.site')).toBe(true);
  });

  it('rejects missing or oversized Turnstile tokens without network calls', async () => {
    const fetcher = vi.fn();
    expect(await verifyTurnstileToken({
      token: '',
      secret: 'secret',
      hostname: 'modu.howlil.site',
      fetcher: fetcher as unknown as typeof fetch
    })).toBe(false);
    expect(await verifyTurnstileToken({
      token: 'x'.repeat(2049),
      secret: 'secret',
      hostname: 'modu.howlil.site',
      fetcher: fetcher as unknown as typeof fetch
    })).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('checks Turnstile hostname and action, not just success', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      hostname: 'evil.example',
      action: 'feature_request'
    }), { status: 200 }));
    const input = {
      token: 'sample-token',
      secret: 'secret',
      hostname: 'modu.howlil.site',
      fetcher: fetcher as unknown as typeof fetch
    };
    expect(await verifyTurnstileToken(input)).toBe(false);
    fetcher.mockResolvedValue(new Response(JSON.stringify({
      success: true,
      hostname: 'modu.howlil.site',
      action: 'wrong-action'
    })));
    expect(await verifyTurnstileToken(input)).toBe(false);
    fetcher.mockResolvedValue(new Response(JSON.stringify({
      success: true,
      hostname: 'modu.howlil.site',
      action: 'feature_request'
    })));
    expect(await verifyTurnstileToken(input)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('fails closed when validation fails or Cloudflare is unavailable', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network error'));
    const input = {
      token: 'sample-token',
      secret: 'secret',
      hostname: 'modu.howlil.site',
      fetcher: fetcher as unknown as typeof fetch
    };
    expect(await verifyTurnstileToken(input)).toBe(false);
    fetcher.mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 }));
    expect(await verifyTurnstileToken(input)).toBe(false);
    fetcher.mockResolvedValue(new Response('unavailable', { status: 503 }));
    expect(await verifyTurnstileToken(input)).toBe(false);
  });
});
