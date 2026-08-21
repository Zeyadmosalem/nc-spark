import { describe, it, expect } from 'vitest';
import { serviceClient, anonClient } from './helpers.js';

// Confirms the installed supabase-js accepts the new-style
// sb_publishable_ / sb_secret_ API key format.
describe('sdk + key compatibility', () => {
  it('accepts the secret key on the admin API', async () => {
    const { error } = await serviceClient().auth.admin.listUsers({ perPage: 1 });
    expect(error).toBeNull();
  });

  it('accepts the publishable key for anon requests', async () => {
    const { error } = await anonClient().auth.getSession();
    expect(error).toBeNull();
  });

  it('reaches PostgREST with the secret key', async () => {
    const { error } = await serviceClient().from('_nonexistent_').select('*').limit(1);
    // PostgREST reports an unknown table from its schema cache, not raw 42P01.
    expect(error?.code).toBe('PGRST205');
  });
});
