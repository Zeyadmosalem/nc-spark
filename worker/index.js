const COOKIE = 'nc_spark_gate';

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]));
}

function safeNext(value) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
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

function tokenFromCookie(request) {
  return request.headers.get('Cookie')?.split(';').map((part) => part.trim().split('='))
    .find(([name]) => name === COOKIE)?.[1] ?? null;
}

async function hasValidSession(request, env) {
  const token = tokenFromCookie(request);
  if (!token) return false;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  return response.ok;
}

async function authenticate(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return new Response('Worker authentication is not configured.', { status: 503 });
  }
  const form = await request.formData();
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  const next = safeNext(String(form.get('next') || '/'));
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!email || !password || !response.ok) {
    return new Response(loginPage(request, 'The email or password was not accepted.'), {
      status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  const data = await response.json();
  return new Response(null, {
    status: 303,
    headers: {
      Location: next,
      'Set-Cookie': `${COOKIE}=${data.access_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${data.expires_in || 3600}`,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/__auth/login' && request.method === 'POST') return authenticate(request, env);
    if (url.pathname === '/__auth/login') {
      return new Response(loginPage(request), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    if (url.pathname === '/__auth/logout') {
      return new Response(null, {
        status: 303,
        headers: { Location: '/__auth/login', 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` },
      });
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      return new Response('Worker authentication is not configured.', { status: 503 });
    }
    if (!(await hasValidSession(request, env))) {
      return Response.redirect(`${url.origin}/__auth/login?next=${encodeURIComponent(url.pathname + url.search)}`, 302);
    }
    return env.ASSETS.fetch(request);
  },
};