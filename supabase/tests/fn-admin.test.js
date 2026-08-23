import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail, SUPABASE_URL } from './helpers.js';

const svc = serviceClient();
let admin, secondAdmin, trainer, trainee, pending;
let cAdmin, cTrainer, cTrainee;

async function call(fn, client, body) {
  const { data: { session } } = await client.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const stateOf = async (id) =>
  (await svc.from('profiles').select('role,status').eq('id', id).single()).data;

/** audit_log is append-only, so scope every lookup to this run's entity. */
const auditFor = async (entityId, action) =>
  (await svc.from('audit_log').select('*').eq('entity_id', entityId).eq('action', action)).data ?? [];

beforeAll(async () => {
  await resetDb();
  admin       = await createUser({ email: uniqueEmail(), role: 'admin' });
  secondAdmin = await createUser({ email: uniqueEmail(), role: 'admin' });
  trainer     = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee     = await createUser({ email: uniqueEmail(), role: 'trainee' });
  pending     = await createUser({ email: uniqueEmail(), role: 'trainee', status: 'pending' });
  [cAdmin, cTrainer, cTrainee] = await Promise.all([
    signIn(admin.email), signIn(trainer.email), signIn(trainee.email),
  ]);
});
afterAll(resetDb);

describe('admin-set-role', () => {
  it('lets an admin promote a trainee to trainer', async () => {
    const subject = await createUser({ email: uniqueEmail(), role: 'trainee' });
    const res = await call('admin-set-role', cAdmin, { userId: subject.id, role: 'trainer' });
    expect(res.status).toBe(200);
    expect((await stateOf(subject.id)).role).toBe('trainer');
  });

  it('writes an audit entry recording before and after', async () => {
    const subject = await createUser({ email: uniqueEmail(), role: 'trainee' });
    await call('admin-set-role', cAdmin, { userId: subject.id, role: 'supervisor' });
    const rows = await auditFor(subject.id, 'profile.role_changed');
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_id).toBe(admin.id);
    expect(rows[0].actor_email).toBe(admin.email);
    expect(rows[0].before.role).toBe('trainee');
    expect(rows[0].after.role).toBe('supervisor');
  });

  it('REJECTS a trainee calling it', async () => {
    const res = await call('admin-set-role', cTrainee, { userId: trainee.id, role: 'admin' });
    expect(res.status).toBe(403);
    expect((await stateOf(trainee.id)).role).toBe('trainee');
  });

  it('REJECTS a trainer calling it', async () => {
    const res = await call('admin-set-role', cTrainer, { userId: trainer.id, role: 'admin' });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated caller', async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-set-role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: trainee.id, role: 'admin' }),
    });
    expect([401, 403]).toContain(res.status);
  });

  it('rejects a SUSPENDED admin, proving the JWT claim is not trusted', async () => {
    const ghost = await createUser({ email: uniqueEmail(), role: 'admin' });
    const c = await signIn(ghost.email);
    await svc.from('profiles').update({ status: 'suspended' }).eq('id', ghost.id);
    const res = await call('admin-set-role', c, { userId: trainee.id, role: 'trainer' });
    expect(res.status).toBe(403);
    expect((await stateOf(trainee.id)).role).toBe('trainee');
  });

  it('rejects an invalid role value', async () => {
    const res = await call('admin-set-role', cAdmin, { userId: trainee.id, role: 'superuser' });
    expect(res.status).toBe(400);
  });

  it('rejects a missing userId', async () => {
    const res = await call('admin-set-role', cAdmin, { role: 'trainer' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown user', async () => {
    const res = await call('admin-set-role', cAdmin, {
      userId: '00000000-0000-0000-0000-000000000000', role: 'trainer',
    });
    expect(res.status).toBe(404);
  });

  it('allows demoting an admin while another admin remains', async () => {
    const spare = await createUser({ email: uniqueEmail(), role: 'admin' });
    const res = await call('admin-set-role', cAdmin, { userId: spare.id, role: 'trainee' });
    expect(res.status).toBe(200);
    expect((await stateOf(spare.id)).role).toBe('trainee');
  });
});

describe('admin-review-signup', () => {
  it('approves a pending user and assigns a role', async () => {
    const subject = await createUser({ email: uniqueEmail(), role: 'trainee', status: 'pending' });
    const res = await call('admin-review-signup', cAdmin, {
      userId: subject.id, decision: 'approve', role: 'trainer',
    });
    expect(res.status).toBe(200);
    expect(await stateOf(subject.id)).toEqual({ role: 'trainer', status: 'active' });
  });

  it('defaults an approved user to trainee when no role is given', async () => {
    const subject = await createUser({ email: uniqueEmail(), role: 'trainee', status: 'pending' });
    await call('admin-review-signup', cAdmin, { userId: subject.id, decision: 'approve' });
    expect((await stateOf(subject.id))).toEqual({ role: 'trainee', status: 'active' });
  });

  it('rejects a pending user', async () => {
    const subject = await createUser({ email: uniqueEmail(), role: 'trainee', status: 'pending' });
    await call('admin-review-signup', cAdmin, { userId: subject.id, decision: 'reject' });
    expect((await stateOf(subject.id)).status).toBe('rejected');
  });

  it('writes an audit entry', async () => {
    const subject = await createUser({ email: uniqueEmail(), role: 'trainee', status: 'pending' });
    await call('admin-review-signup', cAdmin, { userId: subject.id, decision: 'approve' });
    const rows = await auditFor(subject.id, 'profile.signup_reviewed');
    expect(rows).toHaveLength(1);
    expect(rows[0].before.status).toBe('pending');
    expect(rows[0].after.status).toBe('active');
  });

  it('REJECTS a non-admin caller', async () => {
    const res = await call('admin-review-signup', cTrainee, {
      userId: pending.id, decision: 'approve', role: 'admin',
    });
    expect(res.status).toBe(403);
    expect((await stateOf(pending.id)).status).toBe('pending');
  });

  it('refuses to review a user who is not pending', async () => {
    const res = await call('admin-review-signup', cAdmin, { userId: trainee.id, decision: 'approve' });
    expect(res.status).toBe(409);
  });

  it('rejects an invalid decision', async () => {
    const res = await call('admin-review-signup', cAdmin, { userId: pending.id, decision: 'maybe' });
    expect(res.status).toBe(400);
  });
});

describe('admin-suspend-user', () => {
  it('suspends an active user', async () => {
    const subject = await createUser({ email: uniqueEmail(), role: 'trainee' });
    const res = await call('admin-suspend-user', cAdmin, { userId: subject.id, suspend: true });
    expect(res.status).toBe(200);
    expect((await stateOf(subject.id)).status).toBe('suspended');
  });

  it('reinstates a suspended user', async () => {
    const subject = await createUser({ email: uniqueEmail(), role: 'trainee' });
    await call('admin-suspend-user', cAdmin, { userId: subject.id, suspend: true });
    await call('admin-suspend-user', cAdmin, { userId: subject.id, suspend: false });
    expect((await stateOf(subject.id)).status).toBe('active');
  });

  it('locks a suspended user out of the app', async () => {
    const subject = await createUser({ email: uniqueEmail(), role: 'trainee' });
    const c = await signIn(subject.email);
    await call('admin-suspend-user', cAdmin, { userId: subject.id, suspend: true });
    // Their existing token still parses, but the profile says otherwise.
    const { data } = await c.rpc('is_active_probe');
    expect(data).toBe(false);
  });

  it('writes an audit entry for suspension and reinstatement', async () => {
    const subject = await createUser({ email: uniqueEmail(), role: 'trainee' });
    await call('admin-suspend-user', cAdmin, { userId: subject.id, suspend: true });
    await call('admin-suspend-user', cAdmin, { userId: subject.id, suspend: false });
    expect(await auditFor(subject.id, 'profile.suspended')).toHaveLength(1);
    expect(await auditFor(subject.id, 'profile.reinstated')).toHaveLength(1);
  });

  it('REJECTS a non-admin caller', async () => {
    const res = await call('admin-suspend-user', cTrainee, { userId: admin.id, suspend: true });
    expect(res.status).toBe(403);
    expect((await stateOf(admin.id)).status).toBe('active');
  });
});

describe('last-admin protection', () => {
  /**
   * Runs `body` in a world where `keepId` really is the only active admin.
   *
   * The guard counts active admins, so these tests are meaningless unless that
   * is true. They used to suspend one known secondAdmin and assume resetDb had
   * cleared everyone else — which stopped holding once review accounts began
   * surviving resetDb, and both tests failed. Establishing the precondition
   * rather than assuming it makes them independent of whatever else exists.
   */
  async function asOnlyActiveAdmin(keepId, body) {
    const { data: others } = await svc.from('profiles')
      .select('id').eq('role', 'admin').eq('status', 'active').neq('id', keepId);
    const ids = (others ?? []).map((o) => o.id);
    if (ids.length) {
      await svc.from('profiles').update({ status: 'suspended' }).in('id', ids);
    }
    try {
      return await body();
    } finally {
      if (ids.length) {
        await svc.from('profiles').update({ status: 'active' }).in('id', ids);
      }
    }
  }

  // Locking everyone out of administration is unrecoverable without direct
  // database access, so both paths that could cause it are refused.
  it('refuses to demote the last active admin', async () => {
    await asOnlyActiveAdmin(admin.id, async () => {
      const res = await call('admin-set-role', cAdmin, { userId: admin.id, role: 'trainee' });
      expect(res.status).toBe(409);
      expect((await stateOf(admin.id)).role).toBe('admin');
    });
  });

  it('refuses to suspend the last active admin', async () => {
    await asOnlyActiveAdmin(admin.id, async () => {
      const res = await call('admin-suspend-user', cAdmin, { userId: admin.id, suspend: true });
      expect(res.status).toBe(409);
      expect((await stateOf(admin.id)).status).toBe('active');
    });
  });
});
