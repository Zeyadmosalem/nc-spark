import { describe, it, expect, vi } from 'vitest';

// Simulates a deploy where VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY were
// never set on the host. client.js then exports `supabase = null`, and every
// call through it used to die with "Cannot read properties of null".
//
// requireClient mirrors the real contract from client.js rather than importing
// it: importActual would re-evaluate the module against the developer's own
// .env.local and fire real network requests at the live project.
vi.mock('./client', () => ({
  supabase: null,
  isConfigured: false,
  requireClient: () => { throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL…'); },
}));

const { getSession, onAuthChange, signIn, signUp, signOut, resetPassword } =
  await import('./auth');

describe('auth wrapper on an unconfigured deploy', () => {
  it('reports no session instead of throwing, so the app can still render', async () => {
    await expect(getSession()).resolves.toBeNull();
  });

  it('returns a working unsubscribe from onAuthChange', () => {
    const unsubscribe = onAuthChange(() => {});
    expect(() => unsubscribe()).not.toThrow();
  });

  // Each of these must route through requireClient, not touch `supabase`
  // directly, or the user gets a TypeError instead of an explanation.
  it.each([
    ['signIn', () => signIn('a@b.com', 'pw')],
    ['signUp', () => signUp({ email: 'a@b.com', password: 'pw', name: 'A' })],
    ['signOut', () => signOut()],
    ['resetPassword', () => resetPassword('a@b.com')],
  ])('%s fails with a readable configuration error, not a TypeError', async (_name, call) => {
    await expect(call()).rejects.toThrow(/not configured/i);
  });
});
