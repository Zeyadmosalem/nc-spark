import { describe, it, expect, beforeAll } from 'vitest';
import { serviceClient } from './helpers.js';

describe('profiles schema', () => {
  let svc;
  beforeAll(() => { svc = serviceClient(); });

  it('has a profiles table', async () => {
    const { error } = await svc.from('profiles').select('id').limit(1);
    expect(error).toBeNull();
  });

  it('has a trainee_stats table', async () => {
    const { error } = await svc.from('trainee_stats').select('profile_id').limit(1);
    expect(error).toBeNull();
  });

  /**
   * Creating the auth user is the whole fixture: handle_new_user inserts both
   * the profile and the trainee_stats row.
   *
   * This used to insert them by hand, under a comment saying the trigger
   * "arrives in the next migration". It arrived. From that day the two inserts
   * were duplicate keys that failed every time — and the failures went
   * nowhere, because the results were discarded. The tests still passed,
   * because the trigger had already done the work. Found by making fixture
   * writes assert (B19), which is precisely the class of thing it was for.
   */
  async function seedProfile() {
    const email = `probe${Date.now()}-${Math.round(performance.now())}@example.com`;
    const { data: u, error } = await svc.auth.admin.createUser({
      email, password: 'Test-Passw0rd!', email_confirm: true,
    });
    if (error) throw error;
    return u.user.id;
  }

  it('rejects an invalid role value', async () => {
    const id = await seedProfile();
    const { error } = await svc.from('profiles').update({ role: 'superuser' }).eq('id', id);
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/invalid input value for enum/i);
    await svc.auth.admin.deleteUser(id);
  });

  it('rejects negative XP', async () => {
    const id = await seedProfile();
    const { error } = await svc.from('trainee_stats').update({ xp: -5 }).eq('profile_id', id);
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/violates check constraint/i);
    await svc.auth.admin.deleteUser(id);
  });

  it('cascades the profile away when the auth user is deleted', async () => {
    const id = await seedProfile();
    await svc.auth.admin.deleteUser(id);
    const { data } = await svc.from('profiles').select('id').eq('id', id);
    expect(data ?? []).toHaveLength(0);
  });
});
