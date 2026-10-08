export type RateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

export function isAllowedOrigin(origin: string | null, expectedOrigin: string): boolean {
  return origin === expectedOrigin;
}

export async function checkFeatureRequestRateLimit(
  ipLimiter: RateLimiter | undefined,
  sharedLimiter: RateLimiter | undefined,
  clientIp: string
): Promise<'allowed' | 'limited' | 'unavailable'> {
  // Missing bindings or service failures must never allow an unthrottled GitHub write.
  if (!ipLimiter || !sharedLimiter) return 'unavailable';

  try {
    const [perIp, shared] = await Promise.all([
      ipLimiter.limit({ key: 'feature-request:ip:' + clientIp }),
      sharedLimiter.limit({ key: 'feature-request:global' })
    ]);

    return perIp.success && shared.success ? 'allowed' : 'limited';
  } catch {
    return 'unavailable';
  }
}
