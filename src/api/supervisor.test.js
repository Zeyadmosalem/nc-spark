import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const client = { from, functions: { invoke: vi.fn() } };
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const { myTrainers, teamCourses, teamEnrollments, teamQuizAttempts } =
  await import('./supervisor');

beforeEach(() => vi.clearAllMocks());

function chain(result, calls = []) {
  const obj = {
    calls,
    select: (...a) => { calls.push(['select', ...a]); return obj; },
    eq:     (...a) => { calls.push(['eq', ...a]);     return obj; },
    in:     (...a) => { calls.push(['in', ...a]);     return obj; },
    not:    (...a) => { calls.push(['not', ...a]);    return obj; },
    order:  (...a) => { calls.push(['order', ...a]);  return obj; },
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  };
  return obj;
}

describe('myTrainers', () => {
  it('lifts the joined profile out and sorts by name', async () => {
    from.mockReturnValue(chain({
      data: [
        { trainer_id: 't2', profiles: { id: 't2', name: 'Zoe', avatar: 'Z', email: 'z@x.io', status: 'active' } },
        { trainer_id: 't1', profiles: { id: 't1', name: 'Ada', avatar: 'A', email: 'a@x.io', status: 'active' } },
      ],
      error: null,
    }));
    const out = await myTrainers();
    expect(out.map((t) => t.name)).toEqual(['Ada', 'Zoe']);
    expect(out[0]).toEqual({
      id: 't1', name: 'Ada', avatar: 'A', email: 'a@x.io', status: 'active',
    });
  });

  // A link row can outlive the profile it points at.
  it('drops a link whose profile is gone rather than rendering a blank', async () => {
    from.mockReturnValue(chain({
      data: [{ trainer_id: 't9', profiles: null }],
      error: null,
    }));
    expect(await myTrainers()).toEqual([]);
  });
});

describe('teamCourses', () => {
  /**
   * courses_select_supervisor is not the only policy on courses —
   * courses_select_published lets the whole catalog through for everyone. A
   * supervisor screen that rendered every published course as "your team's"
   * would be wrong, so the trainer filter is explicit.
   */
  it('filters to the managed trainers rather than trusting the policy', async () => {
    const c = chain({ data: [], error: null });
    from.mockReturnValue(c);
    await teamCourses(['t1', 't2']);
    expect(c.calls).toContainEqual(['in', 'trainer_id', ['t1', 't2']]);
  });

  it('returns nothing, without a round trip, for a supervisor with no trainers', async () => {
    expect(await teamCourses([])).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('maps to camelCase', async () => {
    from.mockReturnValue(chain({
      data: [{ id: 'c1', title: 'Fire Safety', subtitle: 'Basics', status: 'published', icon: 'F', color: '#f00', trainer_id: 't1' }],
      error: null,
    }));
    expect(await teamCourses(['t1'])).toEqual([{
      id: 'c1', title: 'Fire Safety', subtitle: 'Basics',
      status: 'published', icon: 'F', color: '#f00', trainerId: 't1',
    }]);
  });
});

describe('teamEnrollments', () => {
  it('joins progress onto each enrolment', async () => {
    from.mockImplementation((table) => chain(
      table === 'enrollments'
        ? { data: [{ id: 'e1', course_id: 'c1', status: 'active' }], error: null }
        : { data: [{ enrollment_id: 'e1', percent: 60 }], error: null }));
    expect(await teamEnrollments()).toEqual([
      { id: 'e1', courseId: 'c1', status: 'active', percent: 60 },
    ]);
  });

  it('treats a missing progress row as zero', async () => {
    from.mockImplementation((table) => chain(
      table === 'enrollments'
        ? { data: [{ id: 'e1', course_id: 'c1', status: 'active' }], error: null }
        : { data: [], error: null }));
    expect((await teamEnrollments())[0].percent).toBe(0);
  });

  /**
   * A supervisor cannot resolve a trainee id to a name — profiles_select_supervised
   * matches only trainers. Not selecting the column keeps this screen aggregate
   * by construction rather than by whoever writes the next component
   * remembering not to use it.
   */
  it('never asks for trainee_id', async () => {
    const seen = [];
    from.mockImplementation((table) => {
      const c = chain({ data: [], error: null });
      seen.push({ table, calls: c.calls });
      return c;
    });
    await teamEnrollments();
    const cols = seen.find((s) => s.table === 'enrollments').calls[0][1];
    expect(cols).not.toContain('trainee_id');
  });
});

describe('teamQuizAttempts', () => {
  it('names the quiz, which is what B5 was about', async () => {
    from.mockReturnValue(chain({
      data: [{
        id: 'a1', quiz_id: 'q1', status: 'passed', passed: true,
        auto_score: '80.00', final_score: '90.00', submitted_at: '2026-02-01T00:00:00Z',
        quizzes: { id: 'q1', title: 'Module 1 check', course_id: 'c1', pass_mark: '0.70' },
      }],
      error: null,
    }));
    const [row] = await teamQuizAttempts();
    expect(row.quizTitle).toBe('Module 1 check');
    expect(row.courseId).toBe('c1');
    expect(row.score).toBe(90);
  });

  // Before the policy fix this is exactly what the screen rendered.
  it('says so rather than rendering undefined if the quiz is unreadable', async () => {
    from.mockReturnValue(chain({
      data: [{ id: 'a1', quiz_id: 'q1', status: 'passed', passed: true,
               auto_score: null, final_score: null, submitted_at: 's', quizzes: null }],
      error: null,
    }));
    const [row] = await teamQuizAttempts();
    expect(row.quizTitle).toBe('Unknown quiz');
    expect(row.score).toBeNull();
  });

  it('falls back to the auto score before it is finalised', async () => {
    from.mockReturnValue(chain({
      data: [{ id: 'a1', quiz_id: 'q1', status: 'pending_review', passed: null,
               auto_score: '55.00', final_score: null, submitted_at: 's', quizzes: null }],
      error: null,
    }));
    expect((await teamQuizAttempts())[0].score).toBe(55);
  });

  it('excludes attempts still in progress', async () => {
    const c = chain({ data: [], error: null });
    from.mockReturnValue(c);
    await teamQuizAttempts();
    expect(c.calls).toContainEqual(['not', 'submitted_at', 'is', null]);
  });
});
