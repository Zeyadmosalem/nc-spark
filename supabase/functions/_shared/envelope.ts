/**
 * Envelope encryption for message bodies.
 *
 * A data key per thread, wrapped with a master key that lives in this
 * function's secrets and never reaches the database. A stolen database dump
 * therefore contains no readable message text.
 *
 * WebCrypto only — no dependency, and AES-256-GCM is the right primitive here:
 * authenticated, so a tampered ciphertext fails to decrypt rather than
 * returning plausible garbage.
 *
 * The limit, stated plainly: an attacker holding both the database and these
 * secrets can read everything. This is not end-to-end encryption and does not
 * claim to be. See the migration for why E2EE is the wrong shape for this
 * product.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

/** AES-GCM's standard IV length. 96 bits is the size the mode is built for. */
const IV_BYTES = 12;

const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

const unb64 = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/**
 * The master key, from the SUPPORT_MASTER_KEY secret.
 *
 * Refuses to start rather than falling back to a default. A support system
 * that silently encrypts with a well-known key is worse than one that does not
 * encrypt at all, because it looks like it is protecting something.
 */
let masterKeyPromise: Promise<CryptoKey> | null = null;

export function masterKey(): Promise<CryptoKey> {
  if (masterKeyPromise) return masterKeyPromise;

  const raw = Deno.env.get('SUPPORT_MASTER_KEY');
  if (!raw) {
    throw new Error(
      'SUPPORT_MASTER_KEY is not set. Support messages cannot be read or '
      + 'written without it.');
  }

  const bytes = unb64(raw);
  if (bytes.length !== 32) {
    throw new Error(
      `SUPPORT_MASTER_KEY must be 32 bytes of base64 (got ${bytes.length}).`);
  }

  masterKeyPromise = crypto.subtle.importKey(
    'raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return masterKeyPromise;
}

/** A fresh 256-bit data key, for one thread. */
export async function newDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** Wraps a data key with the master key, for storage beside the thread. */
export async function wrapDataKey(key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const rawKey = await crypto.subtle.exportKey('raw', key);
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, await masterKey(), rawKey);
  return { wrapped_key: b64(wrapped), wrap_iv: b64(iv) };
}

export async function unwrapDataKey(wrappedKey: string, wrapIv: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(wrapIv) }, await masterKey(), unb64(wrappedKey));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * A fresh IV for every message.
 *
 * Reusing an IV with the same key is the one mistake that breaks AES-GCM
 * outright — it leaks the XOR of two plaintexts and the authentication key.
 * Generated here rather than passed in, so no caller can get it wrong.
 */
export async function encryptBody(key: CryptoKey, plaintext: string) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return { body_cipher: b64(cipher), body_iv: b64(iv) };
}

export async function decryptBody(key: CryptoKey, cipher: string, iv: string): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(iv) }, key, unb64(cipher));
  return dec.decode(plain);
}
