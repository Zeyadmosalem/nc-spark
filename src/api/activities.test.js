import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const invoke = vi.fn();
const client = { from, functions: { invoke } };
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const { activityToCamel, getActivity, listActivitiesForModule, completeActivity } =
  await import('./activities');

beforeEach(() => vi.clearAllMocks());

function chain(result) {
  const obj = {
    select: () => obj, eq: () => obj, order: () => Promise.resolve(result),
    single: () => Promise.resolve(result), maybeSingle: () => Promise.resolve(result),
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  };
  return obj;
}

describe('activityToCamel', () => {
  it('flattens content onto the row so components keep flat props', () => {
    expect(activityToCamel({
      id: 'a1', module_id: 'm1', type: 'flashcards', title: 'Keywords',
      position: 1, xp: 12, content: { cards: [{ front: 'a', back: 'b' }] },
    })).toEqual({
      id: 'a1', moduleId: 'm1', type: 'flashcards', title: 'Keywords',
      position: 1, xp: 12, cards: [{ front: 'a', back: 'b' }],
    });
  });

  it('flattens a video payload', () => {
    const out = activityToCamel({
      id: 'a2', module_id: 'm1', type: 'video', title: 'Intro', position: 1, xp: 10,
      content: { videoId: 'abc', duration: '12:30', description: 'd' },
    });
    expect(out.videoId).toBe('abc');
    expect(out.duration).toBe('12:30');
  });

  it('flattens a reading body, which the component reads as activity.body', () => {
    const out = activityToCamel({
      id: 'a3', module_id: 'm1', type: 'reading', title: 'Guide', position: 1, xp: 8,
      content: { body: '## Heading', estimatedMinutes: 5 },
    });
    expect(out.body).toBe('## Heading');
    expect(out.estimatedMinutes).toBe(5);
  });

  it('does not leave a nested content key behind', () => {
    const out = activityToCamel({
      id: 'a4', module_id: 'm1', type: 'matching', title: 'M', position: 1, xp: 5,
      content: { pairs: [] },
    });
    expect(out.content).toBeUndefined();
  });

  it('handles an empty content payload', () => {
    const out = activityToCamel({
      id: 'a5', module_id: 'm1', type: 'quiz', title: 'Q', position: 1, xp: 0, content: {},
    });
    expect(out.type).toBe('quiz');
  });

  // A payload key must never be able to overwrite the row's own identity.
  it('does not let a content key shadow the activity id or type', () => {
    const out = activityToCamel({
      id: 'a6', module_id: 'm1', type: 'reading', title: 'T', position: 1, xp: 1,
      content: { id: 'spoofed', type: 'quiz', body: 'x' },
    });
    expect(out.id).toBe('a6');
    expect(out.type).toBe('reading');
    expect(out.body).toBe('x');
  });

  it('returns null for a missing row', () => {
    expect(activityToCamel(null)).toBeNull();
  });
});

describe('getActivity', () => {
  it('returns a flattened activity', async () => {
    from.mockReturnValue(chain({
      data: { id: 'a1', module_id: 'm1', type: 'scenario', title: 'S', position: 1, xp: 20,
              content: { steps: [{ id: 'step1' }] } },
      error: null,
    }));
    const out = await getActivity('a1');
    expect(out.steps).toHaveLength(1);
  });

  it('throws the server message on failure', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'denied' } }));
    await expect(getActivity('a1')).rejects.toThrow(/denied/);
  });
});

describe('listActivitiesForModule', () => {
  it('returns flattened activities in order', async () => {
    from.mockReturnValue(chain({
      data: [
        { id: 'a1', module_id: 'm1', type: 'reading', title: 'R', position: 1, xp: 5, content: { body: 'b' } },
        { id: 'a2', module_id: 'm1', type: 'video', title: 'V', position: 2, xp: 5, content: { videoId: 'v' } },
      ],
      error: null,
    }));
    const out = await listActivitiesForModule('m1');
    expect(out.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(out[1].videoId).toBe('v');
  });

  it('returns an empty list rather than null', async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    expect(await listActivitiesForModule('m1')).toEqual([]);
  });
});

describe('completeActivity', () => {
  it('invokes the edge function with the activity and payload', async () => {
    invoke.mockResolvedValue({ data: { ok: true, progress: { percent: 50 } }, error: null });
    await completeActivity('a1', { score: 3 });
    expect(invoke).toHaveBeenCalledWith('complete-activity', {
      body: { activityId: 'a1', payload: { score: 3 } },
    });
  });

  it('defaults the payload to an empty object', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await completeActivity('a1');
    expect(invoke.mock.calls[0][1].body.payload).toEqual({});
  });

  it('surfaces a locked-module refusal', async () => {
    invoke.mockResolvedValue({ data: { error: 'Finish the previous module first' }, error: null });
    await expect(completeActivity('a1')).rejects.toThrow(/previous module/);
  });
});
