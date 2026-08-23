import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const invoke = vi.fn();
const client = { from, functions: { invoke } };
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const { attemptToCamel, quizForActivity, myAttempt, startQuiz, submitQuiz } =
  await import('./quizzes');

beforeEach(() => vi.clearAllMocks());

function chain(result) {
  const obj = {
    select: () => obj, eq: () => obj, is: () => obj,
    order: () => obj, limit: () => obj,
    single: () => Promise.resolve(result), maybeSingle: () => Promise.resolve(result),
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  };
  return obj;
}

describe('attemptToCamel', () => {
  it('maps an attempt row', () => {
    expect(attemptToCamel({
      id: 'at1', quiz_id: 'q1', attempt_no: 2, status: 'failed',
      started_at: '2026-01-01T00:00:00Z', submitted_at: '2026-01-01T00:10:00Z',
      auto_score: '40.00', final_score: '40.00', passed: false,
    })).toEqual({
      id: 'at1', quizId: 'q1', attemptNo: 2, status: 'failed',
      startedAt: '2026-01-01T00:00:00Z', submittedAt: '2026-01-01T00:10:00Z',
      autoScore: 40, finalScore: 40, passed: false,
    });
  });

  it('keeps a null score null rather than turning it into zero', () => {
    const out = attemptToCamel({
      id: 'at1', quiz_id: 'q1', attempt_no: 1, status: 'pending_review',
      started_at: 's', auto_score: '50.00', final_score: null, passed: null,
    });
    expect(out.finalScore).toBeNull();
    expect(out.passed).toBeNull();
  });

  it('returns null for a missing row', () => {
    expect(attemptToCamel(null)).toBeNull();
  });
});

describe('quizForActivity', () => {
  it('returns the quiz attached to an activity', async () => {
    from.mockReturnValue(chain({
      data: { id: 'q1', title: 'Mini Quiz', pass_mark: '0.70', time_limit_seconds: 600 },
      error: null,
    }));
    const out = await quizForActivity('a1');
    expect(out).toEqual({ id: 'q1', title: 'Mini Quiz', passMark: 0.7, timeLimitSeconds: 600 });
  });

  it('returns null when the activity has no quiz yet', async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    expect(await quizForActivity('a1')).toBeNull();
  });

  it('throws the server message on failure', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'denied' } }));
    await expect(quizForActivity('a1')).rejects.toThrow(/denied/);
  });
});

describe('myAttempt', () => {
  it('returns the latest attempt', async () => {
    from.mockReturnValue(chain({
      data: { id: 'at2', quiz_id: 'q1', attempt_no: 2, status: 'passed', started_at: 's', passed: true },
      error: null,
    }));
    const out = await myAttempt('q1');
    expect(out.attemptNo).toBe(2);
    expect(out.passed).toBe(true);
  });

  it('returns null before the first attempt', async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    expect(await myAttempt('q1')).toBeNull();
  });
});

describe('startQuiz', () => {
  it('invokes the edge function', async () => {
    invoke.mockResolvedValue({ data: { ok: true, questions: [] }, error: null });
    await startQuiz('q1');
    expect(invoke).toHaveBeenCalledWith('start-quiz', { body: { quizId: 'q1' } });
  });

  it('surfaces a locked refusal', async () => {
    invoke.mockResolvedValue({ data: { error: 'Finish the previous module first' }, error: null });
    await expect(startQuiz('q1')).rejects.toThrow(/previous module/);
  });

  it('surfaces an exhausted attempt', async () => {
    invoke.mockResolvedValue({
      data: { error: 'You have already used your attempt at this quiz' }, error: null,
    });
    await expect(startQuiz('q1')).rejects.toThrow(/already used your attempt/);
  });
});

describe('submitQuiz', () => {
  it('sends the attempt and the answers', async () => {
    invoke.mockResolvedValue({ data: { ok: true, score: 80, passed: true }, error: null });
    const answers = [{ questionId: 'q1_1', response: { index: 2 } }];
    await submitQuiz('at1', answers);
    expect(invoke).toHaveBeenCalledWith('submit-quiz', {
      body: { attemptId: 'at1', answers },
    });
  });

  it('defaults to an empty answer list rather than sending undefined', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await submitQuiz('at1');
    expect(invoke.mock.calls[0][1].body.answers).toEqual([]);
  });

  it('surfaces a double submission', async () => {
    invoke.mockResolvedValue({
      data: { error: 'This attempt has already been submitted' }, error: null,
    });
    await expect(submitQuiz('at1', [])).rejects.toThrow(/already been submitted/);
  });
});
