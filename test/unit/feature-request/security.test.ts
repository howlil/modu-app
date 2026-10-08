import { describe, expect, it, vi } from 'vitest';
import {
  checkFeatureRequestRateLimit,
  isAllowedOrigin
} from '../../../src/lib/server/feature-request-security';

describe('feature request security', () => {
  it('requires an exact same-origin request', () => {
    expect(isAllowedOrigin(null, 'https://modu.howlil.site')).toBe(false);
    expect(isAllowedOrigin('https://evil.example', 'https://modu.howlil.site')).toBe(false);
    expect(isAllowedOrigin('https://modu.howlil.site', 'https://modu.howlil.site')).toBe(true);
  });

  it('allows a request only when both rate limiters approve', async () => {
    const perIp = { limit: vi.fn().mockResolvedValue({ success: true }) };
    const shared = { limit: vi.fn().mockResolvedValue({ success: true }) };
    expect(await checkFeatureRequestRateLimit(perIp, shared, '203.0.113.8')).toBe('allowed');
    expect(perIp.limit).toHaveBeenCalledWith({ key: 'feature-request:ip:203.0.113.8' });
    expect(shared.limit).toHaveBeenCalledWith({ key: 'feature-request:global' });
  });

  it('limits requests when either limiter rejects them', async () => {
    const allowed = { limit: vi.fn().mockResolvedValue({ success: true }) };
    const rejected = { limit: vi.fn().mockResolvedValue({ success: false }) };
    expect(await checkFeatureRequestRateLimit(rejected, allowed, '203.0.113.8')).toBe('limited');
    expect(await checkFeatureRequestRateLimit(allowed, rejected, '203.0.113.8')).toBe('limited');
  });

  it('fails closed when bindings are missing or return errors', async () => {
    const allowed = { limit: vi.fn().mockResolvedValue({ success: true }) };
    const failing = { limit: vi.fn().mockRejectedValue(new Error('Cloudflare unavailable')) };
    expect(await checkFeatureRequestRateLimit(undefined, allowed, '203.0.113.8')).toBe('unavailable');
    expect(await checkFeatureRequestRateLimit(allowed, undefined, '203.0.113.8')).toBe('unavailable');
    expect(await checkFeatureRequestRateLimit(failing, allowed, '203.0.113.8')).toBe('unavailable');
  });
});
