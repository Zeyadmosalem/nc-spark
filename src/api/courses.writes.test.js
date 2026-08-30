import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain, callTo, makeClient } from '../test/supabaseStub';

// The course writes. The column grant behind these names exactly the
// presentation columns — `update (title, subtitle, description, color, icon)`
// — so `status` and `trainer_id` are not writable from a browser at all. That
// is what makes publishing and reassigning Edge Function work, and it is why
// updateCourse sends a fixed field list rather than spreading its patch.

const { client, from, invoke } = makeClient();
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const { createCourse, updateCourse, deleteCourse, publishCourse } = await import('./courses');

beforeEach(() => {
  from.mockReset();
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

const row = (over = {}) => ({
  id: 'c1', slug: 'fire-safety', title: 'Fire Safety', subtitle: null,
  description: null, color: null, icon: null, status: 'draft',
  trainer_id: null, created_at: null, updated_at: null, ...over,
});

describe('createCourse', () => {
  it('derives a slug from the title', async () => {
    const q = chain({ data: row(), error: null });
    from.mockReturnValue(q);

    await createCourse({ title: 'Fire Safety' });
    expect(callTo(q, 'insert')[1]).toMatchObject({ slug: 'fire-safety', title: 'Fire Safety' });
  });

  it('makes a slug that is safe in a url', async () => {
    const q = chain({ data: row(), error: null });
    from.mockReturnValue(q);

    await createCourse({ title: '  Manual Handling: Level 2 (2026)!  ' });
    expect(callTo(q, 'insert')[1].slug).toBe('manual-handling-level-2-2026');
  });

  it('returns the row in the shape the app reads', async () => {
    from.mockReturnValue(chain({ data: row({ trainer_id: 't1' }), error: null }));
    const course = await createCourse({ title: 'Fire Safety' });

    expect(course).toMatchObject({ id: 'c1', title: 'Fire Safety', trainerId: 't1' });
  });

  it('throws when the insert is refused', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'duplicate key' } }));
    await expect(createCourse({ title: 'Fire Safety' })).rejects.toThrow('duplicate key');
  });
});

describe('updateCourse', () => {
  it('updates the presentation columns', async () => {
    const q = chain({ data: row(), error: null });
    from.mockReturnValue(q);

    await updateCourse('c1', { title: 'New', subtitle: 'S', description: 'D', color: '#fff', icon: 'book' });
    expect(callTo(q, 'update')[1])
      .toEqual({ title: 'New', subtitle: 'S', description: 'D', color: '#fff', icon: 'book' });
    expect(callTo(q, 'eq')).toEqual(['eq', 'id', 'c1']);
  });

  /**
   * A fixed field list, not a spread. The grant does not cover status or
   * trainer_id, so a patch carrying either would be refused outright — and a
   * caller passing one by accident would break an unrelated save.
   */
  it('never sends status or trainer_id, whatever the caller passes', async () => {
    const q = chain({ data: row(), error: null });
    from.mockReturnValue(q);

    await updateCourse('c1', { title: 'New', status: 'published', trainer_id: 'someone' });
    const patch = callTo(q, 'update')[1];

    expect(patch).not.toHaveProperty('status');
    expect(patch).not.toHaveProperty('trainer_id');
  });

  it('throws when the update is refused', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'permission denied' } }));
    await expect(updateCourse('c1', { title: 'x' })).rejects.toThrow('permission denied');
  });
});

describe('deleteCourse', () => {
  it('deletes by id', async () => {
    const q = chain({ data: null, error: null });
    from.mockReturnValue(q);

    await deleteCourse('c1');
    expect(from).toHaveBeenCalledWith('courses');
    expect(callTo(q, 'eq')).toEqual(['eq', 'id', 'c1']);
  });

  it('throws rather than reporting a silent success', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'permission denied' } }));
    await expect(deleteCourse('c1')).rejects.toThrow('permission denied');
  });
});

describe('publishCourse', () => {
  /** Status is never a table write: the function validates content first. */
  it('goes through the Edge Function, not the table', async () => {
    await publishCourse('c1', true);

    expect(invoke).toHaveBeenCalledWith('publish-course', { body: { courseId: 'c1', publish: true } });
    expect(from).not.toHaveBeenCalled();
  });

  it('unpublishes the same way', async () => {
    await publishCourse('c1', false);
    expect(invoke).toHaveBeenCalledWith('publish-course', { body: { courseId: 'c1', publish: false } });
  });

  it('throws the reason the function refused', async () => {
    invoke.mockResolvedValue({
      data: { error: 'A course needs at least one activity before it can be published' },
      error: null,
    });
    await expect(publishCourse('c1', true))
      .rejects.toThrow('A course needs at least one activity');
  });
});
