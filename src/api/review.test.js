import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain, callTo, makeClient } from '../test/supabaseStub';

// The trainer's two queues. RLS already restricts attempts to the caller's own
// courses, so these ask for the queue without naming a trainer — which means
// the filters here ARE the queue definition, and a wrong one silently shows a
// trainer somebody else's marking or nothing at all.

const { client, from, invoke } = makeClient();
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const {
  pendingReviews, blockedAttempts, openRetakeGrants, gradeParagraph, grantRetake,
} = await import('./review');

beforeEach(() => {
  from.mockReset();
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

const attempt = (over = {}) => ({
  id: 'a1', quiz_id: 'q1', attempt_no: 1, status: 'pending_review',
  submitted_at: '2026-03-01T10:00:00Z', auto_score: '60.00',
  profiles: { id: 't1', name: 'Alice Ahmed', avatar: 'AA' },
  quizzes: { id: 'q1', title: 'Module check', pass_mark: '0.70', courses: { id: 'c1', title: 'Fire Safety' } },
  quiz_answers: [],
  ...over,
});

describe('pendingReviews', () => {
  it('asks only for attempts waiting to be marked, oldest first', async () => {
    const q = chain({ data: [], error: null });
    from.mockReturnValue(q);

    await pendingReviews();
    expect(from).toHaveBeenCalledWith('quiz_attempts');
    expect(callTo(q, 'eq')).toEqual(['eq', 'status', 'pending_review']);
    expect(callTo(q, 'order')).toEqual(['order', 'submitted_at', { ascending: true }]);
  });

  it('flattens the quiz, the course and the trainee onto the row', async () => {
    from.mockReturnValue(chain({ data: [attempt()], error: null }));
    const [row] = await pendingReviews();

    expect(row).toMatchObject({
      attemptId: 'a1', quizId: 'q1', quizTitle: 'Module check',
      courseTitle: 'Fire Safety', traineeName: 'Alice Ahmed',
      traineeAvatar: 'AA', autoScore: 60,
    });
  });

  /**
   * Only the paragraphs need marking; everything else was graded on submit.
   * Listing an already-marked paragraph would invite it to be marked twice.
   */
  it('lists only the paragraphs still unmarked', async () => {
    from.mockReturnValue(chain({ data: [attempt({ quiz_answers: [
      { id: 'x1', question_id: 'q-mcq', response: { index: 0 }, awarded: 1,
        quiz_questions: { id: 'q-mcq', type: 'mcq', prompt: 'Pick', points: 1 } },
      { id: 'x2', question_id: 'q-par', response: { text: 'Because...' }, awarded: null,
        quiz_questions: { id: 'q-par', type: 'paragraph', prompt: 'Explain', points: 3 } },
      { id: 'x3', question_id: 'q-done', response: { text: 'Old' }, awarded: 2,
        quiz_questions: { id: 'q-done', type: 'paragraph', prompt: 'Marked', points: 2 } },
    ] })], error: null }));

    const [row] = await pendingReviews();
    expect(row.paragraphs).toEqual([
      { questionId: 'q-par', prompt: 'Explain', points: 3, text: 'Because...' },
    ]);
  });

  it('names a trainee it cannot resolve rather than rendering blank', async () => {
    from.mockReturnValue(chain({ data: [attempt({ profiles: null })], error: null }));
    const [row] = await pendingReviews();
    expect(row.traineeName).toBe('Unknown');
    expect(row.traineeAvatar).toBe('?');
  });

  it('returns an empty queue rather than null', async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    expect(await pendingReviews()).toEqual([]);
  });
});

describe('blockedAttempts', () => {
  it('asks for failed and expired attempts, newest first', async () => {
    const q = chain({ data: [], error: null });
    from.mockReturnValue(q);

    await blockedAttempts();
    expect(callTo(q, 'in')).toEqual(['in', 'status', ['failed', 'expired']]);
    expect(callTo(q, 'order')).toEqual(['order', 'submitted_at', { ascending: false }]);
  });

  /** The final score is the marked one; auto_score is only a fallback. */
  it('prefers the final score over the automatic one', async () => {
    from.mockReturnValue(chain({ data: [attempt({
      status: 'failed', final_score: '55.00', auto_score: '40.00',
    })], error: null }));

    const [row] = await blockedAttempts();
    expect(row.score).toBe(55);
  });

  it('falls back to the automatic score when nothing was marked', async () => {
    from.mockReturnValue(chain({ data: [attempt({
      status: 'failed', final_score: null, auto_score: '40.00',
    })], error: null }));

    expect((await blockedAttempts())[0].score).toBe(40);
  });

  it('reports no score at all rather than zero when neither exists', async () => {
    from.mockReturnValue(chain({ data: [attempt({
      status: 'expired', final_score: null, auto_score: null,
    })], error: null }));

    expect((await blockedAttempts())[0].score).toBeNull();
  });
});

describe('openRetakeGrants', () => {
  it('asks only for grants nobody has used', async () => {
    const q = chain({ data: [{ id: 'g1' }], error: null });
    from.mockReturnValue(q);

    expect(await openRetakeGrants()).toEqual([{ id: 'g1' }]);
    expect(from).toHaveBeenCalledWith('quiz_retake_grants');
    expect(callTo(q, 'is')).toEqual(['is', 'consumed_at', null]);
  });

  it('returns an empty list rather than null', async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    expect(await openRetakeGrants()).toEqual([]);
  });
});

describe('the writes', () => {
  /** Both go through an Edge Function: neither is a table write a browser can make. */
  it('grades a paragraph through grade-paragraph', async () => {
    await gradeParagraph({ attemptId: 'a1', questionId: 'q1', awarded: 2, comment: 'Good' });
    expect(invoke).toHaveBeenCalledWith('grade-paragraph', {
      body: { attemptId: 'a1', questionId: 'q1', awarded: 2, comment: 'Good' },
    });
  });

  it('grants a retake through grant-retake', async () => {
    await grantRetake({ quizId: 'q1', traineeId: 't1', reason: 'Network dropped' });
    expect(invoke).toHaveBeenCalledWith('grant-retake', {
      body: { quizId: 'q1', traineeId: 't1', reason: 'Network dropped' },
    });
  });

  it('throws the reason the function gave, not a generic failure', async () => {
    invoke.mockResolvedValue({ data: { error: 'No failed attempt to retake' }, error: null });
    await expect(grantRetake({ quizId: 'q1', traineeId: 't1' }))
      .rejects.toThrow('No failed attempt to retake');
  });
});
