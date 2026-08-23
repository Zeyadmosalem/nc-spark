import { describe, it, expect, vi } from 'vitest';

// Same unconfigured deploy as auth.unconfigured.test.js. fetchMyProfile runs
// on first paint from useSession, so like getSession it has to degrade rather
// than throw — a TypeError here is what pinned the app on "Loading…".
vi.mock('./client', () => ({
  supabase: null,
  isConfigured: false,
  requireClient: () => { throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL…'); },
}));

const { fetchMyProfile, updateMyProfile } = await import('./profiles');

describe('profiles on an unconfigured deploy', () => {
  it('fetchMyProfile reports no profile instead of throwing', async () => {
    await expect(fetchMyProfile()).resolves.toBeNull();
  });

  it('updateMyProfile fails with a readable configuration error', async () => {
    await expect(updateMyProfile({ name: 'A', avatar: 'A' })).rejects.toThrow(/not configured/i);
  });
});
