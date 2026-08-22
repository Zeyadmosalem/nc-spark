import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const invoke = vi.fn();
const getSession = vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } } }));
const client = { from, functions: { invoke }, auth: { getSession } };
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const { courseToCamel, listCourses, publishCourse, getCourseOutline } = await import('./courses');
const { enrollmentToCamel, applyForCourse } = await import('./enrollments');

beforeEach(() => vi.clearAllMocks());

/** Minimal thenable stand-in for the supabase query builder. */
function chain(result) {
  const obj = {
    select: () => obj, eq: () => obj, order: () => Promise.resolve(result),
    insert: () => obj, update: () => obj, delete: () => obj,
    single: () => Promise.resolve(result), maybeSingle: () => Promise.resolve(result),
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  };
  return obj;
}

describe('courseToCamel', () => {
  it('maps snake_case columns', () => {
    expect(courseToCamel({
      id: 'c1', slug: 'health-and-safety', title: 'H&S', subtitle: 'Basics',
      description: 'd', trainer_id: 't1', color: '#000', icon: 'x',
      status: 'published', created_at: '2026-01-01T00:00:00Z',
    })).toEqual({
      id: 'c1', slug: 'health-and-safety', title: 'H&S', subtitle: 'Basics',
      description: 'd', trainerId: 't1', color: '#000', icon: 'x',
      status: 'published', createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('returns null for a missing row', () => {
    expect(courseToCamel(null)).toBeNull();
  });
});

describe('enrollmentToCamel', () => {
  it('maps columns and carries percent when joined', () => {
    expect(enrollmentToCamel({
      id: 'e1', trainee_id: 's1', course_id: 'c1', status: 'active',
      decided_at: null, completed_at: null, percent: 25,
    })).toEqual({
      id: 'e1', traineeId: 's1', courseId: 'c1', status: 'active',
      decidedAt: null, completedAt: null, percent: 25,
    });
  });

  it('defaults percent to 0 when absent', () => {
    expect(enrollmentToCamel({ id: 'e1', trainee_id: 's1', course_id: 'c1', status: 'pending' }).percent).toBe(0);
  });
});

describe('listCourses', () => {
  it('returns mapped rows', async () => {
    from.mockReturnValue(chain({ data: [{ id: 'c1', title: 'X', status: 'published' }], error: null }));
    const out = await listCourses();
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('c1');
  });

  it('throws the server message on failure', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'boom' } }));
    await expect(listCourses()).rejects.toThrow(/boom/);
  });
});

describe('getCourseOutline', () => {
  it('sorts modules and activities by position', async () => {
    from.mockReturnValue(chain({
      data: {
        id: 'c1', title: 'X', status: 'published',
        modules: [
          { id: 'm2', title: 'Second', position: 2, activities: [] },
          { id: 'm1', title: 'First', position: 1, activities: [
            { id: 'a2', type: 'reading', title: 'B', position: 2, xp: 5 },
            { id: 'a1', type: 'video', title: 'A', position: 1, xp: 10 },
          ] },
        ],
      },
      error: null,
    }));
    const out = await getCourseOutline('c1');
    expect(out.modules.map((m) => m.title)).toEqual(['First', 'Second']);
    expect(out.modules[0].activities.map((a) => a.title)).toEqual(['A', 'B']);
  });

  it('returns null for a missing course', async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    expect(await getCourseOutline('nope')).toBeNull();
  });
});

describe('publishCourse', () => {
  it('invokes the edge function with the right body', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await publishCourse('c1', true);
    expect(invoke).toHaveBeenCalledWith('publish-course', { body: { courseId: 'c1', publish: true } });
  });

  it('surfaces an error returned inside the body', async () => {
    invoke.mockResolvedValue({ data: { error: 'needs an activity' }, error: null });
    await expect(publishCourse('c1', true)).rejects.toThrow(/needs an activity/);
  });
});

describe('applyForCourse', () => {
  it('never sends a status, so an application cannot approve itself', async () => {
    const insert = vi.fn(() => chain({ data: { id: 'e1', status: 'pending' }, error: null }));
    from.mockReturnValue({ insert });
    await applyForCourse('c1');
    const arg = insert.mock.calls[0][0];
    expect(arg.course_id).toBe('c1');
    expect(arg.trainee_id).toBe('u1');
    expect(arg.status).toBeUndefined();
  });
});
