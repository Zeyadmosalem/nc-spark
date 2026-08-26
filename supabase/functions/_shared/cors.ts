// Origins permitted to call these functions, as a comma-separated list in the
// ALLOWED_ORIGINS secret, e.g.
//   https://ncspark.example.com,http://localhost:5173
//
// Local development gets a narrow fallback so the app remains usable without
// configuring a secret. Deployed functions fail closed until the secret is set.
const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const localOrigin = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(
  Deno.env.get('SUPABASE_URL') ?? '',
)
  ? 'http://localhost:5173'
  : null;

if (configured.length === 0 && !localOrigin) {
  console.error('ALLOWED_ORIGINS is not set; cross-origin requests are blocked');
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
  const allowed = configured.length > 0 ? configured : localOrigin ? [localOrigin] : [];

  const origin = req.headers.get('Origin') ?? '';
  if (!allowed.includes(origin)) return { ...BASE };

  return {
    ...BASE,
    'Access-Control-Allow-Origin': origin,
  };
}

/** Retained for call sites that predate corsFor; it intentionally grants no origin. */
export const corsHeaders = { ...BASE };

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsFor(req) });
  return null;
}
