// SHOPORA rate limiting — minimal in-process fixed-window limiter for the
// auth endpoints (login, register, forgot/reset password, refresh).
//
// SCOPE LIMITATION: state lives in the Node process memory, so this only
// guards a SINGLE instance. Deployment is a single Docker/Render service, so
// that holds. If the app is ever scaled horizontally, swap this for a shared
// store (e.g. @upstash/ratelimit on Redis) WITHOUT changing call sites — the
// consumeRateLimit() signature below is the seam.

const WINDOW_MS = 60 * 1000; // 1-minute fixed window
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Derive a stable key per auth scope + client IP (trusts reverse-proxy headers). */
export function rateLimitKey(request: Request, scope: string): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  return `${scope}:${ip}`;
}

/**
 * Consume one attempt for `key`. Returns the remaining attempts in the window
 * (>= 0). A return of 0 means the caller is over the limit and MUST reject
 * with 429 — do not perform the underlying work.
 */
export function consumeRateLimit(key: string, limit: number): number {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return limit - 1;
  }

  if (bucket.count >= limit) return 0;
  bucket.count += 1;
  return limit - bucket.count;
}