import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const client = { from, functions: { invoke: vi.fn() } };
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const {
  createModule, updateModule, deleteModule,
  createActivity, updateActivity, deleteActivity,
  CONTENT_KEY, EMPTY_CONTENT, AUTHORABLE_TYPES, getCourseForEditing,
} = await import('./authoring');

beforeEach(() => vi.clearAllMocks());

function chain(result, calls = []) {
  const obj = {
    calls,
    insert: (...a) => { calls.push(['insert', ...a]); return obj; },
    update: (...a) => { calls.push(['update', ...a]); return obj; },
    delete: (...a) => { calls.push(['delete', ...a]); return obj; },
    select: (...a) => { calls.push(['select', ...a]); return obj; },
    eq:     (...a) => { calls.push(['eq', ...a]);     return obj; },
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  };
  return obj;
}

const moduleRow = {
  id: 'm1', course_id: 'c1', title: 'Module 1', position: 1, unlock_after_module_id: null,
};
const activityRow = {
  id: 'a1', module_id: 'm1', type: 'reading', title: 'Read', position: 1, xp: 10,
  content: { body: 'text' },
};

describe('modules', () => {
  it('creates one at the position it was given', async () => {
    const c = chain({ data: moduleRow, error: null });
    from.mockReturnValue(c);
    const out = await createModule({ courseId: 'c1', title: 'Module 1', position: 1 });
    expect(c.calls[0]).toEqual(['insert', {
      course_id: 'c1', title: 'Module 1', position: 1, unlock_after_module_id: null,
    }]);
    expect(out).toEqual({
      id: 'm1', courseId: 'c1', title: 'Module 1', position: 1, unlockAfterModuleId: null,
    });
  });

  /**
   * `unique (course_id, position)` and nothing assigns position. If this read
   * the current max itself, two quick clicks would both read the same number
   * and the second would fail on the constraint instead of queueing.
   */
  it('does not look up the next position itself', async () => {
    const c = chain({ data: moduleRow, error: null });
    from.mockReturnValue(c);
    await createModule({ courseId: 'c1', title: 'M', position: 3 });
    expect(c.calls.filter((k) => k[0] === 'select')).toHaveLength(1); // the returning select
    expect(c.calls[0][1].position).toBe(3);
  });

  it('patches only what it was given', async () => {
    const c = chain({ data: moduleRow, error: null });
    from.mockReturnValue(c);
    await updateModule('m1', { title: 'Renamed' });
    expect(c.calls[0]).toEqual(['update', { title: 'Renamed' }]);
  });

  // null clears the gate; undefined leaves it alone. Collapsing the two would
  // make it impossible to un-gate a module.
  it('tells a cleared unlock gate apart from an untouched one', async () => {
    const cleared = chain({ data: moduleRow, error: null });
    from.mockReturnValue(cleared);
    await updateModule('m1', { unlockAfterModuleId: null });
    expect(cleared.calls[0]).toEqual(['update', { unlock_after_module_id: null }]);

    const untouched = chain({ data: moduleRow, error: null });
    from.mockReturnValue(untouched);
    await updateModule('m1', { title: 'x' });
    expect(untouched.calls[0][1]).not.toHaveProperty('unlock_after_module_id');
  });

  it('deletes by id', async () => {
    const c = chain({ data: null, error: null });
    from.mockReturnValue(c);
    await deleteModule('m1');
    expect(c.calls).toContainEqual(['delete']);
    expect(c.calls).toContainEqual(['eq', 'id', 'm1']);
  });

  it('throws the postgres message', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'duplicate key value' } }));
    await expect(createModule({ courseId: 'c1', title: 'M', position: 1 }))
      .rejects.toThrow(/duplicate key/);
  });
});

describe('activities', () => {
  it('creates one with its content', async () => {
    const c = chain({ data: activityRow, error: null });
    from.mockReturnValue(c);
    const out = await createActivity({
      moduleId: 'm1', type: 'reading', title: 'Read', position: 1, content: { body: 'text' },
    });
    expect(c.calls[0]).toEqual(['insert', {
      module_id: 'm1', type: 'reading', title: 'Read', position: 1, xp: 10,
      content: { body: 'text' },
    }]);
    expect(out.content).toEqual({ body: 'text' });
  });

  /**
   * activities_content_shape is a CHECK constraint: a reading with no `body`
   * key is rejected outright. Defaulting to the right empty shape means an
   * activity created with no content is still storable.
   */
  it('falls back to the shape the CHECK constraint requires', async () => {
    const c = chain({ data: activityRow, error: null });
    from.mockReturnValue(c);
    await createActivity({ moduleId: 'm1', type: 'reading', title: 'Read', position: 1 });
    expect(c.calls[0][1].content).toEqual({ body: '' });
  });

  it('uses an empty object for a type with no required key', async () => {
    const c = chain({ data: activityRow, error: null });
    from.mockReturnValue(c);
    await createActivity({ moduleId: 'm1', type: 'submission', title: 'Upload', position: 2 });
    expect(c.calls[0][1].content).toEqual({});
  });

  it('defaults xp to the column default rather than leaving it undefined', async () => {
    const c = chain({ data: activityRow, error: null });
    from.mockReturnValue(c);
    await createActivity({ moduleId: 'm1', type: 'reading', title: 'R', position: 1 });
    expect(c.calls[0][1].xp).toBe(10);
  });

  it('patches only what it was given', async () => {
    const c = chain({ data: activityRow, error: null });
    from.mockReturnValue(c);
    await updateActivity('a1', { xp: 25 });
    expect(c.calls[0]).toEqual(['update', { xp: 25 }]);
  });

  // 0 XP is a legitimate value and must not be dropped as falsy.
  it('does not treat zero xp as absent', async () => {
    const c = chain({ data: activityRow, error: null });
    from.mockReturnValue(c);
    await updateActivity('a1', { xp: 0 });
    expect(c.calls[0]).toEqual(['update', { xp: 0 }]);
  });

  it('deletes by id', async () => {
    const c = chain({ data: null, error: null });
    from.mockReturnValue(c);
    await deleteActivity('a1');
    expect(c.calls).toContainEqual(['eq', 'id', 'a1']);
  });
});

describe('the shape table', () => {
  // These mirror activities_content_shape. If the constraint changes and this
  // does not, an editor will build payloads the database rejects.
  it('matches the CHECK constraint', () => {
    expect(CONTENT_KEY).toEqual({
      reading: 'body', video: 'videoId', flashcards: 'cards',
      matching: 'pairs', scenario: 'steps',
    });
  });

  it('offers an empty content shape for every authorable type', () => {
    for (const type of AUTHORABLE_TYPES) {
      expect(EMPTY_CONTENT[type]).toBeDefined();
      const key = CONTENT_KEY[type];
      if (key) expect(EMPTY_CONTENT[type]).toHaveProperty(key);
    }
  });
});

describe('getCourseForEditing', () => {
  const nested = {
    id: 'c1', title: 'Fire Safety', subtitle: 'Basics', status: 'draft',
    icon: 'F', color: '#f00', trainer_id: 't1',
    modules: [
      { id: 'm2', course_id: 'c1', title: 'Second', position: 2, unlock_after_module_id: 'm1',
        activities: [] },
      { id: 'm1', course_id: 'c1', title: 'First', position: 1, unlock_after_module_id: null,
        activities: [
          { id: 'a2', module_id: 'm1', type: 'video', title: 'Watch', position: 2, xp: 5, content: { videoId: 'abc' } },
          { id: 'a1', module_id: 'm1', type: 'reading', title: 'Read', position: 1, xp: 10, content: { body: 'text' } },
        ] },
    ],
  };

  it('orders modules and activities by position, not by what postgres returned', async () => {
    from.mockReturnValue(chain({ data: nested, error: null }));
    const out = await getCourseForEditing('c1');
    expect(out.modules.map((m) => m.title)).toEqual(['First', 'Second']);
    expect(out.modules[0].activities.map((a) => a.title)).toEqual(['Read', 'Watch']);
  });

  it('carries content and the unlock gate, which the trainee outline omits', async () => {
    from.mockReturnValue(chain({ data: nested, error: null }));
    const out = await getCourseForEditing('c1');
    expect(out.modules[0].activities[0].content).toEqual({ body: 'text' });
    expect(out.modules[1].unlockAfterModuleId).toBe('m1');
  });

  it('returns null for a course the caller cannot reach', async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    expect(await getCourseForEditing('nope')).toBeNull();
  });

  it('handles a course with no modules', async () => {
    from.mockReturnValue(chain({ data: { ...nested, modules: null }, error: null }));
    expect((await getCourseForEditing('c1')).modules).toEqual([]);
  });
});
