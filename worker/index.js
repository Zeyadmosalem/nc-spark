const COOKIE = 'nc_spark_gate';
const CSRF_COOKIE = 'nc_spark_csrf';

// A login page or a 503 that gets cached outlives the fix meant to clear it.
const NO_STORE = { 'Cache-Control': 'no-store' };
const HTML = { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE };

/**
 * The origins the app itself must reach: PostgREST and Auth over https, and
 * Realtime over wss. Derived from the configured URL rather than written out,
 * so pointing the gate at another project cannot leave the policy behind.
 */
function supabaseOrigins(env) {
  try {
    const { origin } = new URL(env.SUPABASE_URL);
    return `${origin} ${origin.replace(/^https:/, 'wss:')}`;
  } catch {
    return '';
  }
}

/**
 * Headers every response gets, the app's own assets included.
 *
 * The gate is the only thing in front of the app, so it is the only place
 * these can be set. Until now nothing set them at all — including on the
 * sign-in page, which asks for a password and could be framed.
 *
 * `script-src 'self'` is the one that matters: it is the second line behind
 * DOMPurify for trainer-authored course content, and the built page has no
 * inline script for it to break. `style-src` has to allow inline because the
 * app styles a few hundred elements with the style attribute; that is a known
 * cost, and it does not weaken the script rule.
 */
function securityHeaders(env) {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob:",
      // data: is not optional here. The build inlines the smaller Inter and
      // Plus Jakarta subsets as data: URIs, so 'self' alone blocks them and
      // the whole app silently falls back to a system font.
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      `connect-src 'self' ${supabaseOrigins(env)}`.trim(),
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    // Course and roster paths carry ids. The sanitizer deliberately opens
    // authored links in a new tab, so without this those ids travel to
    // whatever a trainer linked to.
    'Referrer-Policy': 'same-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
}

/**
 * Copies a response and adds the headers above.
 *
 * The asset responses come back from the binding already built, so they have
 * to be rebuilt rather than mutated — a Response from fetch has immutable
 * headers.
 */
function harden(response, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders(env))) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]));
}

/**
 * Where to send somebody after they sign in.
 *
 * Only a path on this origin is allowed. Rejecting `//host` is not enough: a
 * browser normalises a backslash to a forward slash while resolving a
 * Location, so `/\host` and `\/host` are delivered as `//host` — a
 * protocol-relative URL, and an open redirect to anywhere.
 */
function safeNext(value) {
  if (typeof value !== 'string') return '/';
  const normalised = value.replace(/\\/g, '/');
  return normalised.startsWith('/') && !normalised.startsWith('//') ? normalised : '/';
}

/**
 * A per-visitor token that a cross-site form cannot read.
 *
 * The gate proxies a password, and a POST from another site would otherwise be
 * honoured — signing the victim's browser in as whoever submitted it. The
 * cookie is SameSite=Lax and so is not sent on a cross-site POST, which means
 * the attacker cannot produce a form field that matches it.
 */
function csrfFromCookie(request) {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const raw = part.trim();
    const eq = raw.indexOf('=');
    if (eq > 0 && raw.slice(0, eq) === CSRF_COOKIE) return raw.slice(eq + 1);
  }
  return null;
}

const newCsrf = () => crypto.randomUUID().replace(/-/g, '');

/** Length-safe, and does not stop early on the first differing character. */
function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The login page, with a token bound to the visitor's cookie.
 *
 * An existing token is reused rather than rotated, so opening the form in a
 * second tab does not silently invalidate the first.
 */
function loginResponse(request, env, { message = '', status = 200 } = {}) {
  const existing = csrfFromCookie(request);
  const token = existing && /^[a-f0-9]{32}$/.test(existing) ? existing : newCsrf();

  return harden(new Response(loginPage(request, message, token), {
    status,
    headers: {
      ...HTML,
      'Set-Cookie': `${CSRF_COOKIE}=${token}; Path=/__auth/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`,
    },
  }), env);
}

function loginPage(request, message = '', csrf = '') {
  const next = safeNext(new URL(request.url).searchParams.get('next'));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NC Spark sign in</title>
<style>
:root{color-scheme:light;font:16px system-ui,sans-serif;background:#f4f1ea;color:#17202a}
body{display:grid;min-height:100vh;place-items:center;margin:0}main{width:min(22rem,calc(100% - 2rem));padding:2rem;background:#fff;border:1px solid #d8d2c8;border-radius:8px;box-shadow:0 12px 40px #17202a14}
h1{margin-top:0;font-size:1.5rem}label{display:block;margin:1rem 0 .35rem;font-weight:650}input,button{box-sizing:border-box;width:100%;padding:.75rem;font:inherit;border:1px solid #a9a39a;border-radius:5px}button{margin-top:1.25rem;border-color:#002f6c;background:#002f6c;color:#fff;cursor:pointer}.error{color:#a32621}.muted{color:#5f666d}
</style></head><body><main><h1>NC Spark</h1><p class="muted">Sign in with your assigned account.</p>
${message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : ''}
<form method="post" action="/__auth/login"><input type="hidden" name="next" value="${escapeHtml(next)}">
<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Sign in</button></form></main></body></html>`;
}

/**
 * The gate cookie's value.
 *
 * Split on the FIRST '=' only. A plain split('=') and [1] truncated any value
 * containing one, which unpadded base64url JWTs happen not to today — the kind
 * of latent bug that locks everybody out on the day a token format changes.
 */
function tokenFromCookie(request) {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const raw = part.trim();
    const eq = raw.indexOf('=');
    if (eq > 0 && raw.slice(0, eq) === COOKIE) return raw.slice(eq + 1);
  }
  return null;
}

function configured(env) {
  try {
    return Boolean(env.SUPABASE_ANON_KEY && new URL(env.SUPABASE_URL));
  } catch {
    return false;
  }
}

/**
 * May this token's owner see the app?
 *
 * Two questions, not one. `/auth/v1/user` answers "is this a real session",
 * and on its own that is not a gate: signUp goes straight to Supabase Auth and
 * never touches this Worker, so anyone holding the anon key can mint a token
 * it accepts. The profile read answers "and is this account allowed in", which
 * is the same check _shared/auth.ts makes before any privileged write.
 *
 * Every failure path returns false. A gate that opens when its backend is
 * unreachable is not a gate.
 */
/** Asks Supabase the two questions, and records the answer. */
async function askSupabase(token, env, ttl) {
  try {
    const session = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!session.ok) {
      remember(token, false, ttl);
      return false;
    }

    const user = await session.json();
    if (!user?.id) {
      remember(token, false, ttl);
      return false;
    }

    // Read as the user, with their own token, so RLS applies:
    // profiles_select_self is what permits this and nothing wider.
    const profile = await fetch(
      `${env.SUPABASE_URL}/rest/v1/profiles?select=status&id=eq.${encodeURIComponent(user.id)}`,
      { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
    );
    if (!profile.ok) {
      remember(token, false, ttl);
      return false;
    }

    const rows = await profile.json();
    const allowed = Array.isArray(rows) && rows[0]?.status === 'active';
    remember(token, allowed, ttl);
    return allowed;
  } catch {
    // Deliberately NOT remembered. Supabase being briefly unreachable is not a
    // decision about this account, and caching it would turn a blip into ten
    // seconds of everybody being locked out.
    return false;
  }
}

async function authorize(request, env) {
  const token = tokenFromCookie(request);
  if (!token) return false;

  const ttl = allowTtl(env);
  if (ttl <= 0) return askSupabase(token, env, ttl);

  const remembered = rememberedDecision(token);
  if (remembered !== undefined) return remembered;

  // A browser opens a page by asking for the document and every asset at
  // once, so on a first visit there is nothing cached yet and all of them
  // would go to Supabase together — the cache alone only helps the SECOND
  // navigation. Sharing the in-flight check is what makes the first page load
  // one round-trip instead of ten.
  const pending = inFlight.get(token);
  if (pending) return pending;

  const check = askSupabase(token, env, ttl);
  inFlight.set(token, check);
  try {
    return await check;
  } finally {
    inFlight.delete(token);
  }
}

/**
 * How long an authorization decision is reused before it is asked again.
 *
 * The gate runs on every request, and a single page load is the document plus
 * its JavaScript, CSS and fonts — so one visit was ten or more round-trips to
 * Supabase, each one blocking a file the browser is waiting for. It was also a
 * steady drip against the auth endpoint's own rate limit.
 *
 * The cost of caching is revocation latency, and it is worth naming exactly:
 * an account suspended or deactivated in the console keeps access for up to
 * ALLOW_TTL_MS. Sixty seconds is short enough that "remove this person now"
 * still means now in any practical sense, and long enough that a page load
 * costs one check rather than ten.
 *
 * Denials expire faster, because the person on the other end of a denial is
 * usually somebody who has just been activated and is waiting to get in.
 *
 * Set AUTH_CACHE_TTL_MS to 0 to check every request, at the cost of the
 * round-trips above — useful while investigating an access problem, when
 * "wait a minute" is not an acceptable answer.
 */
const ALLOW_TTL_MS = 60_000;
const DENY_TTL_MS = 10_000;

function allowTtl(env) {
  const configured = Number(env.AUTH_CACHE_TTL_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : ALLOW_TTL_MS;
}

// Isolates are short-lived, but a busy one should not grow without bound.
const MAX_CACHED = 500;

const decisions = new Map();

// Checks that have been started and not yet answered, so concurrent requests
// carrying the same cookie wait on one call rather than each making their own.
const inFlight = new Map();

function rememberedDecision(token) {
  const hit = decisions.get(token);
  if (!hit) return undefined;
  if (hit.expires <= Date.now()) {
    decisions.delete(token);
    return undefined;
  }
  return hit.allowed;
}

function remember(token, allowed, ttl) {
  if (ttl <= 0) return;
  // Cheaper than tracking least-recently-used, and an isolate that has seen
  // 500 distinct tokens is one where starting again costs little.
  if (decisions.size >= MAX_CACHED) decisions.clear();
  decisions.set(token, {
    allowed,
    expires: Date.now() + (allowed ? ttl : Math.min(DENY_TTL_MS, ttl)),
  });
}

/**
 * Has this caller spent its login attempts?
 *
 * The gate proxies passwords to Supabase, which throttles its own endpoint —
 * but a door that forwards every guess is still a door worth knocking on. The
 * binding is declared in wrangler.jsonc; if it is missing (an older
 * deployment, or an account without it) this returns false, because losing the
 * throttle is a much smaller failure than losing the gate.
 */
async function rateLimited(request, env) {
  if (!env.LOGIN_RATE_LIMIT) return false;
  try {
    const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.LOGIN_RATE_LIMIT.limit({ key });
    return !success;
  } catch {
    return false;
  }
}

async function authenticate(request, env) {
  if (await rateLimited(request, env)) {
    const tooMany = loginResponse(request, env, {
      message: 'Too many sign-in attempts. Wait a minute and try again.',
      status: 429,
    });
    tooMany.headers.set('Retry-After', '60');
    return tooMany;
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return loginResponse(request, env, {
      message: 'That sign-in could not be read.', status: 400,
    });
  }

  // Before the password is read, let alone forwarded: a request that cannot
  // prove it came from our own form has no business reaching Supabase.
  if (!sameToken(String(form.get('csrf') || ''), csrfFromCookie(request) ?? '')) {
    return loginResponse(request, env, {
      message: 'That sign-in form had expired. Please try again.', status: 403,
    });
  }

  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  const next = safeNext(String(form.get('next') || '/'));

  const rejected = () => loginResponse(request, env, {
    message: 'The email or password was not accepted.', status: 401,
  });

  if (!email || !password) return rejected();

  try {
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) return rejected();

    const data = await response.json();
    if (!data?.access_token) return rejected();

    const headers = new Headers({ Location: next, ...NO_STORE });
    headers.append(
      'Set-Cookie',
      `${COOKIE}=${data.access_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${data.expires_in || 3600}`);
    // The token is spent. Leaving it set would let one stolen form field be
    // replayed for the rest of the hour.
    headers.append(
      'Set-Cookie',
      `${CSRF_COOKIE}=; Path=/__auth/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);

    return harden(new Response(null, { status: 303, headers }), env);
  } catch {
    // Supabase unreachable. Say so as a failed sign-in rather than a 500.
    return loginResponse(request, env, {
      message: 'Sign-in is temporarily unavailable.', status: 503,
    });
  }
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // Fail closed, and before any route: a login form that cannot reach
      // Supabase only takes the visitor's password and shows them an error.
      if (!configured(env)) {
        return new Response('Worker authentication is not configured.', {
          status: 503, headers: NO_STORE,
        });
      }

      if (url.pathname === '/__auth/logout') {
        return harden(new Response(null, {
          status: 303,
          headers: {
            Location: '/__auth/login',
            ...NO_STORE,
            'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
          },
        }), env);
      }

      if (url.pathname === '/__auth/login') {
        if (request.method === 'POST') return authenticate(request, env);
        return loginResponse(request, env);
      }

      if (!(await authorize(request, env))) {
        const next = encodeURIComponent(url.pathname + url.search);
        return harden(new Response(null, {
          status: 302,
          headers: { Location: `/__auth/login?next=${next}`, ...NO_STORE },
        }), env);
      }

      return harden(await env.ASSETS.fetch(request), env);
    } catch {
      return new Response('Worker authentication is not configured.', {
        status: 503, headers: NO_STORE,
      });
    }
  },
};
