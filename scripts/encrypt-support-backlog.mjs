// Encrypts support message bodies written before envelope encryption landed.
//
// The migration cannot do this: encrypting needs the master key, which by
// design the database does not have. Run once after deploying
// support-messages, then again any time you find plaintext rows.
//
//   node scripts/encrypt-support-backlog.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { webcrypto as crypto } from 'node:crypto';

const env = Object.fromEntries(
  readFileSync('.env.test', 'utf8').split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const master = env.SUPPORT_MASTER_KEY;
if (!master) { console.error('SUPPORT_MASTER_KEY missing from .env.test'); process.exit(1); }

const b64 = (b) => Buffer.from(b).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

const masterKey = await crypto.subtle.importKey(
  'raw', unb64(master), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

const svc = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

const { data: plain, error } = await svc
  .from('support_messages')
  .select('id, request_id, body')
  .not('body', 'is', null);
if (error) { console.error(error.message); process.exit(1); }

if (!plain.length) { console.log('No plaintext message bodies. Nothing to do.'); process.exit(0); }
console.log(`${plain.length} plaintext bodies to encrypt.`);

// One data key per thread, created here if the thread has none yet.
const keyCache = new Map();
async function threadKey(requestId) {
  if (keyCache.has(requestId)) return keyCache.get(requestId);

  const { data: row } = await svc.from('support_thread_keys')
    .select('wrapped_key, wrap_iv').eq('request_id', requestId).maybeSingle();

  let key;
  if (row) {
    const raw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(row.wrap_iv) }, masterKey, unb64(row.wrapped_key));
    key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } else {
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, masterKey, await crypto.subtle.exportKey('raw', key));
    await svc.from('support_thread_keys').insert({
      request_id: requestId, wrapped_key: b64(wrapped), wrap_iv: b64(iv),
    });
  }
  keyCache.set(requestId, key);
  return key;
}

let done = 0;
for (const m of plain) {
  const key = await threadKey(m.request_id);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(m.body));

  // The plaintext is cleared in the same write that stores the ciphertext, so
  // there is never a row holding both.
  const { error: updErr } = await svc.from('support_messages')
    .update({ body_cipher: b64(cipher), body_iv: b64(iv), body: null })
    .eq('id', m.id);
  if (updErr) { console.error(`${m.id}: ${updErr.message}`); continue; }
  done += 1;
}

console.log(`Encrypted ${done} of ${plain.length}.`);
