// Applies the three Supabase Auth settings from the security audit (S1-S3).
//
//   node scripts/harden-auth.mjs          # show current values, change nothing
//   node scripts/harden-auth.mjs apply    # apply them
//   node scripts/harden-auth.mjs revert   # put back what was there before
//
// These are project settings rather than schema, so they are not a migration
// and nothing in the repo enforces them. This script is how they get applied
// reproducibly and reviewably instead of by clicking through a dashboard.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.test', 'utf8').split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const URL_ = `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/config/auth`;
const HEADERS = {
  Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
};

const KEYS = ['mailer_autoconfirm', 'disable_signup', 'password_min_length', 'password_required_characters'];
const SNAPSHOT = 'scripts/.auth-config.before.json';

/**
 * S1. mailer_autoconfirm was on, so an address was never verified.
 *
 * handle_new_user sets status='active' for any signup whose domain is in
 * allowed_domains. That table is empty today, so nobody gets in — but
 * AllowedDomains.jsx is a shipped admin screen, and the day somebody adds the
 * company domain, anyone on the internet can register anything@thatdomain
 * without owning the mailbox, land active, and walk through the gate. The
 * trigger's whole design assumes a verified address.
 *
 * S2. disable_signup was false. Supabase Auth is a different origin, so the
 * Worker gate does not cover it: with only the public anon key you can create
 * a real row in auth.users, profiles and trainee_stats. They land pending and
 * the gate denies them, so it is not app access — it is an unauthenticated
 * write into the database and a flooded review queue. Accounts here are
 * provisioned by an admin, so the signup endpoint has no job to do.
 *
 * S3. Six characters with no character classes required.
 */
const HARDENED = {
  mailer_autoconfirm: false,
  disable_signup: true,
  password_min_length: 12,
  // Supabase accepts one of four fixed strings, not an arbitrary set — this is
  // the lower/upper/digit/symbol one, copied exactly. The doubled backslash is
  // part of the value, not an escape of mine.
  password_required_characters:
    "abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789:!@#$%^&*()_+-=[]{};'\\\\:\"|<>?,./`~",
};

const show = (label, config) =>
  console.log(label, JSON.stringify(Object.fromEntries(KEYS.map((k) => [k, config[k]])), null, 2));

const read = async () => {
  const res = await fetch(URL_, { headers: HEADERS });
  if (!res.ok) throw new Error(`could not read config: ${res.status} ${await res.text()}`);
  return res.json();
};

const write = async (body) => {
  const res = await fetch(URL_, { method: 'PATCH', headers: HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`could not write config: ${res.status} ${await res.text()}`);
};

const mode = process.argv[2] ?? 'show';
const before = await read();

if (mode === 'show') {
  show('current:', before);
  show('would become:', { ...before, ...HARDENED });
  console.log('\nRun `node scripts/harden-auth.mjs apply` to apply.');
} else if (mode === 'apply') {
  // Written before the change, so revert has something to go back to even if
  // the process dies partway.
  writeFileSync(SNAPSHOT, JSON.stringify(Object.fromEntries(KEYS.map((k) => [k, before[k]])), null, 2));
  show('before:', before);
  await write(HARDENED);
  show('after :', await read());
  console.log(`\nPrevious values saved to ${SNAPSHOT}.`);
  console.log('Note: /signup now returns an error. Accounts are created by an admin.');
} else if (mode === 'revert') {
  if (!existsSync(SNAPSHOT)) throw new Error(`no snapshot at ${SNAPSHOT}`);
  await write(JSON.parse(readFileSync(SNAPSHOT, 'utf8')));
  show('reverted to:', await read());
} else {
  console.error('usage: node scripts/harden-auth.mjs [show|apply|revert]');
  process.exit(1);
}
