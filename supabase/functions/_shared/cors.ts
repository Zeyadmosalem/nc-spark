// Origins permitted to call these functions, as a comma-separated list in the
// ALLOWED_ORIGINS secret, e.g.
//   https://ncspark.example.com,http://localhost:5173
//
// Left unset, this falls back to '*', which is what every deployment did
// before this file changed. That fallback is deliberate: silently breaking a
// running app is worse than the risk it mitigates, and the risk here is small
// — these functions authenticate with a bearer header, not a cookie, so no
// browser attaches credentials to a cross-origin call on its own. Setting the
// secret in production is the hardening step; the warning below is the nudge.
const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (configured.length === 0) {
  console.warn('ALLOWED_ORIGINS is not set; falling back to Access-Control-Allow-Origin: *');
}

const BASE = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

/**
 * Headers for one request. The allowed origin is echoed back rather than
 * listed, because the header accepts a single value, not a list.
 */
export function corsFor(req: Request): Record<string, string> {
  if (configured.length === 0) return { ...BASE, 'Access-Control-Allow-Origin': '*' };

  const origin = req.headers.get('Origin') ?? '';
  return {
    ...BASE,
    // An unrecognised origin gets the first allowed one, which is not a match,
    // so the browser blocks the response. Omitting the header entirely would
    // do the same, but this keeps the shape predictable for logging.
    'Access-Control-Allow-Origin': configured.includes(origin) ? origin : configured[0],
  };
}

/** Retained for call sites that predate corsFor; equivalent to the '*' case. */
export const corsHeaders = { ...BASE, 'Access-Control-Allow-Origin': '*' };

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsFor(req) });
  return null;
}
