const COOKIE = 'nc_spark_gate';

// A login page or a 503 that gets cached outlives the fix meant to clear it.
const NO_STORE = { 'Cache-Control': 'no-store' };
const HTML = { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE };

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

function loginPage(request, message = '') {
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
async function authorize(request, env) {
  const token = tokenFromCookie(request);
  if (!token) return false;

  try {
    const session = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!session.ok) return false;

    const user = await session.json();
    if (!user?.id) return false;

    // Read as the user, with their own token, so RLS applies:
    // profiles_select_self is what permits this and nothing wider.
    const profile = await fetch(
      `${env.SUPABASE_URL}/rest/v1/profiles?select=status&id=eq.${encodeURIComponent(user.id)}`,
      { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
    );
    if (!profile.ok) return false;

    const rows = await profile.json();
    return Array.isArray(rows) && rows[0]?.status === 'active';
  } catch {
    return false;
  }
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
    return new Response(
      loginPage(request, 'Too many sign-in attempts. Wait a minute and try again.'),
      { status: 429, headers: { ...HTML, 'Retry-After': '60' } });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return new Response(loginPage(request, 'That sign-in could not be read.'), {
      status: 400, headers: HTML,
    });
  }

  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  const next = safeNext(String(form.get('next') || '/'));

  const rejected = () => new Response(
    loginPage(request, 'The email or password was not accepted.'),
    { status: 401, headers: HTML });

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

    return new Response(null, {
      status: 303,
      headers: {
        Location: next,
        ...NO_STORE,
        'Set-Cookie': `${COOKIE}=${data.access_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${data.expires_in || 3600}`,
      },
    });
  } catch {
    // Supabase unreachable. Say so as a failed sign-in rather than a 500.
    return new Response(loginPage(request, 'Sign-in is temporarily unavailable.'), {
      status: 503, headers: HTML,
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
        return new Response(null, {
          status: 303,
          headers: {
            Location: '/__auth/login',
            ...NO_STORE,
            'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
          },
        });
      }

      if (url.pathname === '/__auth/login') {
        if (request.method === 'POST') return authenticate(request, env);
        return new Response(loginPage(request), { headers: HTML });
      }

      if (!(await authorize(request, env))) {
        const next = encodeURIComponent(url.pathname + url.search);
        return new Response(null, {
          status: 302,
          headers: { Location: `/__auth/login?next=${next}`, ...NO_STORE },
        });
      }

      return env.ASSETS.fetch(request);
    } catch {
      return new Response('Worker authentication is not configured.', {
        status: 503, headers: NO_STORE,
      });
    }
  },
};
