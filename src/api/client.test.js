import { describe, it, expect, vi, afterEach } from 'vitest';

// client.js reads import.meta.env at module scope, so each case needs a fresh
// module registry with the env stubbed before the import.
async function loadClient(env) {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', env.url);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', env.anonKey);
  return import('./client');
}

afterEach(() => vi.unstubAllEnvs());

describe('requireClient', () => {
  it('throws a message naming the missing variables when unconfigured', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { requireClient, isConfigured, supabase } = await loadClient({ url: '', anonKey: '' });

    expect(isConfigured).toBe(false);
    expect(supabase).toBeNull();
    expect(() => requireClient()).toThrow(/VITE_SUPABASE_URL/);
    expect(() => requireClient()).toThrow(/VITE_SUPABASE_ANON_KEY/);
  });

  it('returns the client when both variables are present', async () => {
    const { requireClient, isConfigured } = await loadClient({
      url: 'https://example.supabase.co', anonKey: 'sb_publishable_test',
    });

    expect(isConfigured).toBe(true);
    expect(requireClient()).toBeTruthy();
  });
});
