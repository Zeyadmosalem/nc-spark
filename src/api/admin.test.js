import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const client = { from, functions: { invoke: vi.fn() } };
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const { listUsers, pendingSignups, platformStats, recentAudit } =
  await import('./admin');

beforeEach(() => vi.clearAllMocks());

/** A thenable that records every call made against it. */
function chain(result, calls = []) {
  const obj = {
    calls,
    select: (...a) => { calls.push(['select', ...a]); return obj; },
    eq:     (...a) => { calls.push(['eq', ...a]);     return obj; },
    in:     (...a) => { calls.push(['in', ...a]);     return obj; },
    order:  (...a) => { calls.push(['order', ...a]);  return obj; },
    limit:  (...a) => { calls.push(['limit', ...a]);  return obj; },
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  };
  return obj;
}

describe('listUsers', () => {
  it('maps every profile to camelCase', async () => {
    from.mockReturnValue(chain({
      data: [{
        id: 'u1', role: 'trainee', status: 'active', name: 'Ada',
        email: 'ada@x.io', avatar: 'A', created_at: '2026-01-01T00:00:00Z',
      }],
      error: null,
    }));
    const out = await listUsers();
    expect(out).toEqual([{
      id: 'u1', role: 'trainee', status: 'active', name: 'Ada',
      email: 'ada@x.io', avatar: 'A', createdAt: '2026-01-01T00:00:00Z',
    }]);
  });

  // select('*') would ship any column a later migration adds. The rest of
  // src/api/ names its columns; this must not be the one place that does not.
  it('names its columns instead of selecting star', async () => {
    const c = chain({ data: [], error: null });
    from.mockReturnValue(c);
    await listUsers();
    const cols = c.calls.find((k) => k[0] === 'select')[1];
    expect(cols).not.toContain('*');
    expect(cols).toContain('email');
  });

  it('returns an empty array rather than null when there are no rows', async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    expect(await listUsers()).toEqual([]);
  });

  it('throws the postgres message on error', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'permission denied' } }));
    await expect(listUsers()).rejects.toThrow(/permission denied/);
  });
});

describe('pendingSignups', () => {
  it('asks only for pending profiles', async () => {
    const c = chain({ data: [], error: null });
    from.mockReturnValue(c);
    await pendingSignups();
    expect(c.calls).toContainEqual(['eq', 'status', 'pending']);
  });

  // Whoever waited longest is reviewed first. Newest-first would quietly bury
  // the person who has been waiting a week under today's signups.
  it('returns the oldest signup first', async () => {
    const c = chain({ data: [], error: null });
    from.mockReturnValue(c);
    await pendingSignups();
    expect(c.calls).toContainEqual(['order', 'created_at', { ascending: true }]);
  });
});

describe('platformStats', () => {
  it('counts courses, enrollments and attempts without downloading them', async () => {
    const seen = [];
    from.mockImplementation((table) => {
      const c = chain({ count: 7, error: null });
      seen.push({ table, calls: c.calls });
      return c;
    });
    const out = await platformStats();

    expect(out).toEqual({
      courses:     { total: 7, published: 7 },
      enrollments: { active: 7, pending: 7 },
      attempts:    { total: 7, pendingReview: 7 },
    });
    // head: true means the rows never cross the wire — only the count does.
    for (const q of seen) {
      expect(q.calls[0]).toEqual(['select', 'id', { count: 'exact', head: true }]);
    }
  });

  it('reads zero as zero, not as missing', async () => {
    from.mockReturnValue(chain({ count: 0, error: null }));
    const out = await platformStats();
    expect(out.courses.total).toBe(0);
  });

  it('throws when a count is refused', async () => {
    from.mockReturnValue(chain({ count: null, error: { message: 'permission denied' } }));
    await expect(platformStats()).rejects.toThrow(/permission denied/);
  });
});

describe('recentAudit', () => {
  it('maps a row and keeps before/after intact', async () => {
    from.mockReturnValue(chain({
      data: [{
        id: 12, actor_id: 'a1', actor_email: 'admin@x.io', action: 'profile.role_changed',
        entity_type: 'profile', entity_id: 'u9',
        before: { role: 'trainee' }, after: { role: 'trainer' },
        created_at: '2026-02-02T00:00:00Z',
      }],
      error: null,
    }));
    expect(await recentAudit()).toEqual([{
      id: 12, actorId: 'a1', actorEmail: 'admin@x.io', action: 'profile.role_changed',
      entityType: 'profile', entityId: 'u9',
      before: { role: 'trainee' }, after: { role: 'trainer' },
      createdAt: '2026-02-02T00:00:00Z',
    }]);
  });

  it('returns newest first, and caps the page', async () => {
    const c = chain({ data: [], error: null });
    from.mockReturnValue(c);
    await recentAudit(5);
    expect(c.calls).toContainEqual(['order', 'created_at', { ascending: false }]);
    expect(c.calls).toContainEqual(['limit', 5]);
  });
});
