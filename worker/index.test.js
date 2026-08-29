// @vitest-environment node
//
// The access gate, which is the one piece of this product that can lock every
// user out of it. It had no tests at all: it was outside both vitest include
// globs, so nothing here had ever run.
//
// The outbound fetch is stubbed throughout. These tests are about what the
// gate DECIDES — who it lets through, where it will redirect to, what it does
// when Supabase is unreachable — not about Supabase's own behaviour.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import gate from './index.js';

// Caching off by default here: the decision cache is module state that
// outlives one test, so every case that is not about caching checks each
// request on its own. The caching block below opts back in.
const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  AUTH_CACHE_TTL_MS: 0,
  ASSETS: { fetch: vi.fn(async () => new Response('the app', { status: 200 })) },
};

/** The same worker with its usual 60s decision cache. */
const CACHING = { ...ENV, AUTH_CACHE_TTL_MS: undefined };

const GOOD_TOKEN = 'header.payload.signature';

/** A request carrying a gate cookie, as the browser would send it. */
const withCookie = (url, token) =>
  new Request(url, { headers: token ? { Cookie: `nc_spark_gate=${token}` } : {} });

/**
 * Stubs the two Supabase endpoints the gate talks to.
 *
 * `user` is /auth/v1/user — does this token belong to somebody.
 * `profile` is PostgREST — and what is that somebody allowed to do. The second
 * is the one that decides `active` vs `pending`.
 */
function stubSupabase({ user = { ok: true }, profile = [{ status: 'active' }] } = {}) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    calls.push(url);
    if (url.includes('/auth/v1/user')) {
      if (user instanceof Error) throw user;
      // The real endpoint returns the user object; the gate needs its id to
      // look the profile up.
      return new Response(
        user.ok ? JSON.stringify({ id: 'user-1' }) : 'no',
        { status: user.ok ? 200 : 401, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/rest/v1/profiles')) {
      if (profile instanceof Error) throw profile;
      return new Response(JSON.stringify(profile), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/auth/v1/token')) {
      return new Response(
        JSON.stringify({ access_token: GOOD_TOKEN, expires_in: 3600 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }));
  return calls;
}

beforeEach(() => { ENV.ASSETS.fetch.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('who gets through', () => {
  it('serves the app to an active account', async () => {
    stubSupabase();
    const res = await gate.fetch(withCookie('https://site.dev/trainee', GOOD_TOKEN), ENV);
    expect(res.status).toBe(200);
    expect(ENV.ASSETS.fetch).toHaveBeenCalled();
  });

  it('sends a visitor with no cookie to the login page', async () => {
    stubSupabase();
    const res = await gate.fetch(new Request('https://site.dev/trainee'), ENV);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/__auth/login');
    expect(ENV.ASSETS.fetch).not.toHaveBeenCalled();
  });

  /**
   * S3, and the reason this file exists.
   *
   * signUp goes straight to Supabase Auth and never touches this Worker, so
   * anyone holding the anon key can mint a token that /auth/v1/user accepts.
   * Authenticating is therefore not enough — the gate has to ask what the
   * account is ALLOWED to do, which is exactly what _shared/auth.ts does
   * before any privileged write.
   */
  it('refuses a pending account even though its token is valid', async () => {
    stubSupabase({ user: { ok: true }, profile: [{ status: 'pending' }] });
    const res = await gate.fetch(withCookie('https://site.dev/', GOOD_TOKEN), ENV);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/__auth/login');
    expect(ENV.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('refuses a suspended account', async () => {
    stubSupabase({ user: { ok: true }, profile: [{ status: 'suspended' }] });
    const res = await gate.fetch(withCookie('https://site.dev/', GOOD_TOKEN), ENV);
    expect(res.status).toBe(302);
    expect(ENV.ASSETS.fetch).not.toHaveBeenCalled();
  });

  /** No profile row at all is a refusal, not a pass. */
  it('refuses when the profile cannot be read', async () => {
    stubSupabase({ user: { ok: true }, profile: [] });
    const res = await gate.fetch(withCookie('https://site.dev/', GOOD_TOKEN), ENV);
    expect(res.status).toBe(302);
    expect(ENV.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('refuses a token Supabase rejects', async () => {
    stubSupabase({ user: { ok: false } });
    const res = await gate.fetch(withCookie('https://site.dev/', 'stale'), ENV);
    expect(res.status).toBe(302);
    expect(ENV.ASSETS.fetch).not.toHaveBeenCalled();
  });
});

describe('when Supabase is unreachable', () => {
  /**
   * S5. An unhandled throw inside the Worker is a 500 for every asset on the
   * page, so one blip took the whole site down rather than one request.
   */
  it('fails closed to the login page rather than throwing', async () => {
    stubSupabase({ user: new Error('network down') });
    const res = await gate.fetch(withCookie('https://site.dev/', GOOD_TOKEN), ENV);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/__auth/login');
    expect(ENV.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('survives the profile lookup failing', async () => {
    stubSupabase({ user: { ok: true }, profile: new Error('rest down') });
    const res = await gate.fetch(withCookie('https://site.dev/', GOOD_TOKEN), ENV);
    expect(res.status).toBe(302);
    expect(ENV.ASSETS.fetch).not.toHaveBeenCalled();
  });
});

describe('the next parameter', () => {
  const loginWith = async (next) => {
    stubSupabase();
    const body = new FormData();
    body.set('email', 'a@b.com');
    body.set('password', 'pw');
    body.set('next', next);
    const res = await gate.fetch(
      new Request('https://site.dev/__auth/login', { method: 'POST', body }), ENV);
    return res.headers.get('Location');
  };

  it('keeps an ordinary path', async () => {
    expect(await loginWith('/trainee/courses')).toBe('/trainee/courses');
  });

  it('refuses a protocol-relative url', async () => {
    expect(await loginWith('//evil.example.com')).toBe('/');
  });

  it('refuses an absolute url', async () => {
    expect(await loginWith('https://evil.example.com')).toBe('/');
  });

  /**
   * S4. Browsers normalise a backslash to a forward slash in a Location, so
   * `/\evil.example.com` is delivered as `//evil.example.com` — an open
   * redirect that the `//` check alone does not catch.
   */
  it('refuses a backslash url', async () => {
    expect(await loginWith('/\\evil.example.com')).toBe('/');
  });

  it('refuses a backslash-forwardslash url', async () => {
    expect(await loginWith('\\/evil.example.com')).toBe('/');
  });
});

describe('signing in', () => {
  it('sets an HttpOnly, Secure, SameSite cookie on success', async () => {
    stubSupabase();
    const body = new FormData();
    body.set('email', 'a@b.com');
    body.set('password', 'pw');
    const res = await gate.fetch(
      new Request('https://site.dev/__auth/login', { method: 'POST', body }), ENV);

    expect(res.status).toBe(303);
    const cookie = res.headers.get('Set-Cookie');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('reports a rejected password without saying which half was wrong', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 400 })));
    const body = new FormData();
    body.set('email', 'a@b.com');
    body.set('password', 'wrong');
    const res = await gate.fetch(
      new Request('https://site.dev/__auth/login', { method: 'POST', body }), ENV);

    expect(res.status).toBe(401);
    const html = await res.text();
    expect(html).toContain('email or password was not accepted');
  });

  /** A malformed body is a 400, not an unhandled throw. */
  it('survives a POST that is not form data', async () => {
    stubSupabase();
    const res = await gate.fetch(new Request('https://site.dev/__auth/login', {
      method: 'POST', body: 'not-a-form', headers: { 'Content-Type': 'application/json' },
    }), ENV);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe('the login page', () => {
  it('escapes the next value into the form', async () => {
    const res = await gate.fetch(
      new Request('https://site.dev/__auth/login?next=%2F%22%3E%3Cscript%3E'), ENV);
    const html = await res.text();
    expect(html).not.toContain('<script>');
    expect(html).toContain('&quot;');
  });

  /** S6: a cached login page or 503 outlives the fix that should clear it. */
  it('is not cacheable', async () => {
    const res = await gate.fetch(new Request('https://site.dev/__auth/login'), ENV);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('clears the cookie on logout', async () => {
    const res = await gate.fetch(new Request('https://site.dev/__auth/logout'), ENV);
    expect(res.status).toBe(303);
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
});

describe('when the worker is not configured', () => {
  const BARE = { ASSETS: ENV.ASSETS };

  it('says so rather than serving the app', async () => {
    const res = await gate.fetch(new Request('https://site.dev/'), BARE);
    expect(res.status).toBe(503);
    expect(ENV.ASSETS.fetch).not.toHaveBeenCalled();
  });

  /**
   * The live symptom that started this: every path returned 503, including the
   * login page, which made it look like the app itself was broken.
   */
  it('is not cacheable either', async () => {
    const res = await gate.fetch(new Request('https://site.dev/'), BARE);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });
});

describe('reading the cookie', () => {
  /**
   * split('=') truncated any value containing '='. Supabase JWTs are unpadded
   * base64url today, so this was latent rather than broken — but the gate
   * would have started rejecting everyone the day that changed.
   */
  it('keeps a token that contains an equals sign', async () => {
    const calls = stubSupabase();
    await gate.fetch(withCookie('https://site.dev/', 'abc=='), ENV);
    const userCall = calls.find((u) => u.includes('/auth/v1/user'));
    expect(userCall).toBeTruthy();
    // The token reaches Supabase whole rather than cut at the first '='.
    expect(globalThis.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer abc==');
  });
});

describe('rate limiting the login form', () => {
  /** The binding's shape: limit({ key }) -> { success }. */
  const limiter = (allow) => ({ limit: vi.fn(async () => ({ success: allow })) });

  const post = async (env, ip = '203.0.113.9') => {
    const body = new FormData();
    body.set('email', 'a@b.com');
    body.set('password', 'guess');
    return gate.fetch(new Request('https://site.dev/__auth/login', {
      method: 'POST', body, headers: { 'CF-Connecting-IP': ip },
    }), env);
  };

  it('lets an ordinary attempt through', async () => {
    stubSupabase();
    const res = await post({ ...ENV, LOGIN_RATE_LIMIT: limiter(true) });
    expect(res.status).toBe(303);
  });

  it('refuses once the limit is spent, without asking Supabase', async () => {
    stubSupabase();
    const env = { ...ENV, LOGIN_RATE_LIMIT: limiter(false) };
    const res = await post(env);

    expect(res.status).toBe(429);
    // The point of the limit: the password never reaches the auth endpoint.
    const tried = globalThis.fetch.mock.calls
      .some(([u]) => String(u).includes('/auth/v1/token'));
    expect(tried).toBe(false);
  });

  it('keys the limit on the caller, not the whole site', async () => {
    stubSupabase();
    const rl = limiter(true);
    await post({ ...ENV, LOGIN_RATE_LIMIT: rl }, '198.51.100.4');
    expect(rl.limit).toHaveBeenCalledWith({ key: '198.51.100.4' });
  });

  /**
   * The binding is declared in wrangler.jsonc, so a deployment that predates
   * it — or an account where it is unavailable — hands the Worker an env
   * without it. Losing the gate entirely would be a far worse outcome than
   * losing the throttle, so its absence must not throw.
   */
  it('still signs people in when the binding is absent', async () => {
    stubSupabase();
    const res = await post(ENV);
    expect(res.status).toBe(303);
  });

  it('does not throttle ordinary page loads', async () => {
    stubSupabase();
    const rl = limiter(false);
    const res = await gate.fetch(
      withCookie('https://site.dev/trainee', GOOD_TOKEN),
      { ...ENV, LOGIN_RATE_LIMIT: rl });

    expect(res.status).toBe(200);
    expect(rl.limit).not.toHaveBeenCalled();
  });
});

describe('how often it asks Supabase', () => {
  /**
   * A page load is the document plus its JavaScript, CSS and fonts, and the
   * gate runs on every one of them. Before the cache that was ten or more
   * blocking round-trips per visit, and a steady drip against the auth
   * endpoint's own rate limit.
   *
   * Each test uses a token of its own: the cache is module state that outlives
   * a single test, which is exactly what makes it useful and exactly what
   * would make these leak into each other.
   */
  const load = (token, n) => Promise.all(
    Array.from({ length: n }, (_, i) =>
      gate.fetch(withCookie(`https://site.dev/assets/${i}.js`, token), CACHING)));

  const supabaseCalls = () => globalThis.fetch.mock.calls
    .filter(([u]) => String(u).includes('/auth/v1/user')).length;

  it('asks once for a whole page of assets', async () => {
    stubSupabase();
    await load('page-load-token', 10);
    expect(supabaseCalls()).toBe(1);
  });

  it('still serves every one of them', async () => {
    stubSupabase();
    const all = await load('serve-all-token', 6);
    expect(all.every((r) => r.status === 200)).toBe(true);
  });

  it('does not confuse one person with another', async () => {
    stubSupabase({ user: { ok: true }, profile: [{ status: 'active' }] });
    await gate.fetch(withCookie('https://site.dev/', 'person-a'), CACHING);

    // A second token has to be checked on its own.
    await gate.fetch(withCookie('https://site.dev/', 'person-b'), CACHING);
    expect(supabaseCalls()).toBe(2);
  });

  /**
   * The cost of the cache, stated as a test: an account suspended in the
   * console keeps access until the decision expires, and then does not.
   */
  it('lets a suspended account back out again once the decision expires', async () => {
    vi.useFakeTimers();
    try {
      stubSupabase({ user: { ok: true }, profile: [{ status: 'active' }] });
      const first = await gate.fetch(withCookie('https://site.dev/', 'to-suspend'), CACHING);
      expect(first.status).toBe(200);

      // Suspended in the console. The cached decision still stands.
      stubSupabase({ user: { ok: true }, profile: [{ status: 'suspended' }] });
      const during = await gate.fetch(withCookie('https://site.dev/', 'to-suspend'), CACHING);
      expect(during.status).toBe(200);

      vi.advanceTimersByTime(61_000);
      const after = await gate.fetch(withCookie('https://site.dev/', 'to-suspend'), CACHING);
      expect(after.status).toBe(302);
    } finally {
      vi.useRealTimers();
    }
  });

  /** And the other direction, faster, because somebody is waiting to get in. */
  it('lets a newly activated account in without a long wait', async () => {
    vi.useFakeTimers();
    try {
      stubSupabase({ user: { ok: true }, profile: [{ status: 'pending' }] });
      const before = await gate.fetch(withCookie('https://site.dev/', 'to-activate'), CACHING);
      expect(before.status).toBe(302);

      stubSupabase({ user: { ok: true }, profile: [{ status: 'active' }] });
      vi.advanceTimersByTime(11_000);
      const after = await gate.fetch(withCookie('https://site.dev/', 'to-activate'), CACHING);
      expect(after.status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * A blip is not a decision. Caching it would turn one unreachable moment
   * into ten seconds of everybody being locked out, including the people who
   * would otherwise have been served from cache.
   */
  it('does not remember a network failure', async () => {
    stubSupabase({ user: new Error('down') });
    const failed = await gate.fetch(withCookie('https://site.dev/', 'blip-token'), CACHING);
    expect(failed.status).toBe(302);

    stubSupabase();
    const recovered = await gate.fetch(withCookie('https://site.dev/', 'blip-token'), CACHING);
    expect(recovered.status).toBe(200);
  });
});
