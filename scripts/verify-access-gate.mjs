// Is there an access gate in front of the live site, and what does it cover?
//
// B1 is a dashboard-only change — Cloudflare Access is enabled by clicking a
// toggle, not by anything in this repository. That is exactly why it needs a
// script: a change nothing in the codebase records is a change nobody can tell
// has been undone. Run this after enabling the gate, and again whenever you
// want to know it is still there.
//
// The second half is the part worth reading. An access gate on the Worker
// protects the APP. It does not protect the DATABASE, which answers on its own
// hostname and never sees a request that went through Cloudflare. So this also
// checks the two properties that actually decide what a stranger can do if
// they find the Supabase project directly.
//
// Usage: npm run verify:gate
//        SITE_URL=https://... npm run verify:gate

import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const SITE = process.env.SITE_URL ?? 'https://nc-spark-gate.ncspark.workers.dev';

let failures = 0;
let warnings = 0;

const pass = (label, detail = '') =>
  console.log(`   PASS  ${label}${detail ? ` — ${detail}` : ''}`);
const fail = (label, detail = '') => {
  failures += 1;
  console.log(`   FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const warn = (label, detail = '') => {
  warnings += 1;
  console.log(`   WARN  ${label}${detail ? ` — ${detail}` : ''}`);
};

// ---------------------------------------------------------------- the gate --

console.log(`\n1. The gate, on ${SITE}\n`);

// `redirect: manual` matters. Following the redirect lands on the Cloudflare
// Access login page, which is a 200 — indistinguishable from the app itself if
// you only look at the status code.
const res = await fetch(SITE, { redirect: 'manual' });
const location = res.headers.get('location') ?? '';
const gated = res.status >= 300 && res.status < 400
  && (/cloudflareaccess\.com/i.test(location) || /\/__auth\/login(?:\?|$)/i.test(location));

if (gated) {
  pass('an unauthenticated request is challenged', `${res.status} → Access`);
} else if (res.status === 200) {
  const body = await res.text();
  const isApp = body.includes('<div id="root"');
  fail(
    'an unauthenticated request is challenged',
    isApp
      ? `200 and the app HTML came back — the site is open to anyone with the URL`
      : `200, and the body is not the app either — check ${SITE} by hand`);
} else {
  warn('an unauthenticated request is challenged',
    `unexpected ${res.status}${location ? ` → ${location}` : ''}`);
}

// The bundle carries the Supabase URL and anon key. Behind the gate it stops
// being anonymously downloadable, which is most of what the gate buys.
if (gated) {
  const asset = await fetch(`${SITE}/assets/`, { redirect: 'manual' });
  const assetGated = asset.status >= 300 && asset.status < 400
    && (/cloudflareaccess\.com/i.test(asset.headers.get('location') ?? '')
      || /\/__auth\/login(?:\?|$)/i.test(asset.headers.get('location') ?? ''));
  if (assetGated) pass('static assets are behind the same gate');
  else warn('static assets are behind the same gate', `got ${asset.status}`);
}

// ------------------------------------------------- what the gate misses --

console.log('\n2. What the gate does NOT cover (the Supabase project)\n');

const envPath = existsSync('.env.test.local') ? '.env.test.local' : '.env.test';
if (!existsSync(envPath)) {
  warn('Supabase checks skipped', `no ${envPath}`);
} else {
  const env = Object.fromEntries(
    readFileSync(envPath, 'utf8').split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }));

  const svc = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } });

  // The single most consequential row in the schema for this question.
  // handle_new_user() reads allowed_domains to decide `active` vs `pending`.
  // A public domain in here — gmail.com, outlook.com — means anyone who
  // reaches Supabase directly self-registers as an ACTIVE trainee, gate or no
  // gate, because signUp goes to Supabase Auth and never touches the Worker.
  const { data: domains, error: dErr } = await svc
    .from('allowed_domains').select('domain');

  if (dErr) {
    fail('allowed_domains readable for audit', dErr.message);
  } else {
    const PUBLIC_MAIL = [
      'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
      'yahoo.com', 'icloud.com', 'proton.me', 'protonmail.com', 'aol.com',
      'mail.com', 'gmx.com', 'yandex.com', 'zoho.com',
    ];
    const listed = domains.map((d) => d.domain);
    const open = listed.filter((d) => PUBLIC_MAIL.includes(d));

    if (open.length) {
      fail('no public mail domain auto-approves a signup',
        `${open.join(', ')} — anyone with that address becomes an active trainee`);
    } else {
      pass('no public mail domain auto-approves a signup',
        listed.length ? `allowlist: ${listed.join(', ')}` : 'allowlist is empty');
    }
  }

  // Who exists. A stranger's account would show up here as a pending trainee
  // on a domain nobody recognises, which is the evidence that the URL got out.
  const { data: profiles, error: pErr } = await svc
    .from('profiles').select('email, role, status').order('created_at');

  if (pErr) {
    fail('profiles readable for audit', pErr.message);
  } else {
    const strangers = profiles.filter((p) => !p.email.endsWith('@ncspark-review.local'));
    if (strangers.length === 0) {
      pass('no accounts beyond the known review logins', `${profiles.length} total`);
    } else {
      warn('no accounts beyond the known review logins',
        `${strangers.length} other: ${strangers.map((p) => `${p.email} (${p.status})`).join(', ')}`);
    }

    // B2. These are admin-capable logins on a domain that cannot receive mail,
    // so there is no password-reset path and no way to prove ownership.
    const review = profiles.length - strangers.length;
    if (review > 0) {
      warn('review accounts still exist (B2)',
        `${review} on ncspark-review.local, one of them admin`);
    } else {
      pass('review accounts have been removed (B2)');
    }
  }
}

// --------------------------------------------------------------- verdict --

console.log('');
if (failures) {
  console.log(`${failures} failed, ${warnings} warning(s).\n`);
  process.exit(1);
}
console.log(`All checks passed${warnings ? `, ${warnings} warning(s)` : ''}.\n`);
