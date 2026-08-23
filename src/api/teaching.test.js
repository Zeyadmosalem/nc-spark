import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const invoke = vi.fn();
const client = { from, functions: { invoke } };
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const { pendingTeachingRequests, decideTeachingRequest } = await import('./teaching');

beforeEach(() => vi.clearAllMocks());

function chain(result, calls = []) {
  const obj = {
    calls,
    select: (...a) => { calls.push(['select', ...a]); return obj; },
    eq:     (...a) => { calls.push(['eq', ...a]);     return obj; },
    order:  (...a) => { calls.push(['order', ...a]);  return obj; },
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  };
  return obj;
}

describe('pendingTeachingRequests', () => {
  it('flattens the trainer and the course onto one row', async () => {
    from.mockReturnValue(chain({
      data: [{
        id: 'r1', status: 'pending', created_at: '2026-01-01T00:00:00Z',
        profiles: { id: 't1', name: 'Grace', avatar: 'G', email: 'g@x.io' },
        courses: { id: 'c1', title: 'Fire Safety', status: 'draft' },
      }],
      error: null,
    }));
    expect(await pendingTeachingRequests()).toEqual([{
      id: 'r1', status: 'pending', createdAt: '2026-01-01T00:00:00Z',
      trainerId: 't1', trainerName: 'Grace', trainerAvatar: 'G', trainerEmail: 'g@x.io',
      courseId: 'c1', courseTitle: 'Fire Safety',
    }]);
  });

  it('asks only for pending requests, oldest first', async () => {
    const c = chain({ data: [], error: null });
    from.mockReturnValue(c);
    await pendingTeachingRequests();
    expect(c.calls).toContainEqual(['eq', 'status', 'pending']);
    expect(c.calls).toContainEqual(['order', 'created_at', { ascending: true }]);
  });

  // A deleted trainer or course leaves the join null. Rendering "undefined
  // wants to teach undefined" is worse than an honest placeholder.
  it('survives a missing trainer or course', async () => {
    from.mockReturnValue(chain({
      data: [{ id: 'r1', status: 'pending', created_at: 'x', profiles: null, courses: null }],
      error: null,
    }));
    const [row] = await pendingTeachingRequests();
    expect(row.trainerName).toBe('Unknown');
    expect(row.courseTitle).toBe('');
  });

  it('throws rather than returning an empty queue on refusal', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'permission denied' } }));
    await expect(pendingTeachingRequests()).rejects.toThrow(/permission denied/);
  });
});

describe('decideTeachingRequest', () => {
  it('goes through the Edge Function, never a table write', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await decideTeachingRequest('r1', 'approve');
    expect(invoke).toHaveBeenCalledWith('approve-teaching-request', {
      body: { requestId: 'r1', decision: 'approve' },
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('surfaces the already-decided conflict', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Request has already been decided' } });
    await expect(decideTeachingRequest('r1', 'approve'))
      .rejects.toThrow(/already been decided/);
  });
});
