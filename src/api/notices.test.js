import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const getSession = vi.fn(async () => ({ data: { session: { user: { id: 's1' } } } }));
const client = { from, auth: { getSession } };
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const { myNotices } = await import('./notices');

/** A thenable stand-in that records which table was asked for. */
function tableStub(results) {
  return (table) => {
    const result = results[table] ?? { data: [], error: null };
    const obj = {
      select: () => obj, eq: () => obj, in: () => obj, is: () => obj,
      order: () => obj, gte: () => obj, limit: () => obj, not: () => obj,
      then: (res, rej) => Promise.resolve(result).then(res, rej),
    };
    return obj;
  };
}

beforeEach(() => vi.clearAllMocks());

describe('myNotices', () => {
  it('reports nothing when there is nothing', async () => {
    from.mockImplementation(tableStub({}));
    const out = await myNotices();
    expect(out).toEqual({ awaitingReview: [], retakesReady: [], recentlyGraded: [], total: 0 });
  });

  it('lists a quiz awaiting review', async () => {
    from.mockImplementation(tableStub({
      quiz_attempts: {
        data: [{
          id: 'at1', status: 'pending_review', graded_at: null, passed: null, final_score: null,
          submitted_at: '2026-08-23T10:00:00Z',
          quizzes: { id: 'q1', title: 'Loops', courses: { title: 'Programming' } },
        }],
        error: null,
      },
    }));
    const out = await myNotices();
    expect(out.awaitingReview).toHaveLength(1);
    expect(out.awaitingReview[0].quizTitle).toBe('Loops');
    expect(out.total).toBe(1);
  });

  it('lists a graded result separately from one still waiting', async () => {
    from.mockImplementation(tableStub({
      quiz_attempts: {
        data: [
          { id: 'at1', status: 'pending_review', graded_at: null, passed: null,
            quizzes: { id: 'q1', title: 'Waiting', courses: { title: 'C' } } },
          { id: 'at2', status: 'passed', graded_at: '2026-08-23T12:00:00Z', passed: true,
            final_score: '90.00', quizzes: { id: 'q2', title: 'Marked', courses: { title: 'C' } } },
        ],
        error: null,
      },
    }));
    const out = await myNotices();
    expect(out.awaitingReview.map((a) => a.quizTitle)).toEqual(['Waiting']);
    expect(out.recentlyGraded.map((a) => a.quizTitle)).toEqual(['Marked']);
    expect(out.recentlyGraded[0].score).toBe(90);
  });

  it('lists a retake that is ready to use', async () => {
    from.mockImplementation(tableStub({
      quiz_retake_grants: {
        data: [{ id: 'g1', reason: 'Connection dropped',
                 quizzes: { id: 'q1', title: 'Safety', courses: { title: 'H&S' } } }],
        error: null,
      },
    }));
    const out = await myNotices();
    expect(out.retakesReady).toHaveLength(1);
    expect(out.retakesReady[0].quizTitle).toBe('Safety');
    expect(out.retakesReady[0].reason).toBe('Connection dropped');
  });

  it('counts every kind toward the total', async () => {
    from.mockImplementation(tableStub({
      quiz_attempts: {
        data: [
          { id: 'at1', status: 'pending_review', graded_at: null, passed: null,
            quizzes: { id: 'q1', title: 'A', courses: { title: 'C' } } },
          { id: 'at2', status: 'failed', graded_at: '2026-08-23T12:00:00Z', passed: false,
            final_score: '20.00', quizzes: { id: 'q2', title: 'B', courses: { title: 'C' } } },
        ],
        error: null,
      },
      quiz_retake_grants: {
        data: [{ id: 'g1', reason: null, quizzes: { id: 'q3', title: 'C', courses: { title: 'C' } } }],
        error: null,
      },
    }));
    const out = await myNotices();
    expect(out.total).toBe(3);
  });

  it('throws the server message on failure', async () => {
    from.mockImplementation(tableStub({
      quiz_attempts: { data: null, error: { message: 'denied' } },
    }));
    await expect(myNotices()).rejects.toThrow(/denied/);
  });
});
