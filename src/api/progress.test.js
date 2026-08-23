import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const getSession = vi.fn();
const client = { from, auth: { getSession }, functions: { invoke: vi.fn() } };
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const { myQuizResults, completedActivityCount } = await import('./progress');

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: { user: { id: 'me' } } } });
});

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

describe('myQuizResults', () => {
  it('flattens the quiz and course onto the attempt', async () => {
    from.mockReturnValue(chain({
      data: [{
        id: 'a1', quiz_id: 'q1', attempt_no: 1, status: 'passed',
        submitted_at: '2026-02-01T00:00:00Z', auto_score: '80.00',
        final_score: '85.00', passed: true,
        quizzes: { id: 'q1', title: 'Module 1 check', pass_mark: '0.70', courses: { id: 'c1', title: 'Fire Safety' } },
      }],
      error: null,
    }));
    expect(await myQuizResults()).toEqual([{
      id: 'a1', quizId: 'q1', quizTitle: 'Module 1 check', courseTitle: 'Fire Safety',
      attemptNo: 1, status: 'passed', submittedAt: '2026-02-01T00:00:00Z',
      score: 85, passed: true,
    }]);
  });

  /**
   * final_score stays null until a trainer marks the paragraph. Coercing it to
   * 0 would show a trainee a zero for work that has not been looked at yet.
   */
  it('falls back to the auto score, and keeps an unscored attempt null', async () => {
    from.mockReturnValue(chain({
      data: [
        { id: 'a1', quiz_id: 'q1', attempt_no: 1, status: 'pending_review',
          submitted_at: 's', auto_score: '50.00', final_score: null, passed: null, quizzes: null },
        { id: 'a2', quiz_id: 'q2', attempt_no: 1, status: 'pending_review',
          submitted_at: 's', auto_score: null, final_score: null, passed: null, quizzes: null },
      ],
      error: null,
    }));
    const [withAuto, withNothing] = await myQuizResults();
    expect(withAuto.score).toBe(50);
    expect(withNothing.score).toBeNull();
    expect(withNothing.passed).toBeNull();
  });

  /**
   * quiz_attempts_select also matches admins and trainers. A function called
   * "my results" that returns the whole cohort for an admin is a trap, so the
   * caller is named explicitly rather than left to the policy.
   */
  it('scopes to the signed-in user rather than trusting the policy', async () => {
    const c = chain({ data: [], error: null });
    from.mockReturnValue(c);
    await myQuizResults();
    expect(c.calls).toContainEqual(['eq', 'trainee_id', 'me']);
  });

  it('excludes attempts that are still in progress', async () => {
    const c = chain({ data: [], error: null });
    from.mockReturnValue(c);
    await myQuizResults();
    expect(c.calls).toContainEqual(['not', 'submitted_at', 'is', null]);
  });

  it('throws rather than showing an empty history on refusal', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'permission denied' } }));
    await expect(myQuizResults()).rejects.toThrow(/permission denied/);
  });
});

describe('completedActivityCount', () => {
  it('counts without downloading the rows', async () => {
    const c = chain({ count: 12, error: null });
    from.mockReturnValue(c);
    expect(await completedActivityCount(['e1', 'e2'])).toBe(12);
    expect(c.calls[0]).toEqual(['select', 'id', { count: 'exact', head: true }]);
    expect(c.calls).toContainEqual(['in', 'enrollment_id', ['e1', 'e2']]);
  });

  // `in` with an empty array is a query that can only return nothing.
  it('returns zero without a round trip when there are no enrolments', async () => {
    expect(await completedActivityCount([])).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it('reads zero as zero, not as missing', async () => {
    from.mockReturnValue(chain({ count: 0, error: null }));
    expect(await completedActivityCount(['e1'])).toBe(0);
  });

  it('throws when the count is refused', async () => {
    from.mockReturnValue(chain({ count: null, error: { message: 'denied' } }));
    await expect(completedActivityCount(['e1'])).rejects.toThrow(/denied/);
  });
});
