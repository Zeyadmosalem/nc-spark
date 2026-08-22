import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
let trainer, courseId, moduleId;

beforeAll(async () => {
  await resetDb();
  trainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  const { data: c } = await svc.from('courses')
    .insert({ slug: `hs-${Date.now()}`, title: 'Health and Safety', trainer_id: trainer.id, created_by: trainer.id })
    .select().single();
  courseId = c.id;
  const { data: m } = await svc.from('modules')
    .insert({ course_id: courseId, title: 'Fundamentals', position: 1 })
    .select().single();
  moduleId = m.id;
});
afterAll(async () => {
  await svc.from('courses').delete().eq('id', courseId);
  await resetDb();
});

describe('catalog schema', () => {
  it('creates a course with a draft status by default', async () => {
    const { data } = await svc.from('courses').select('status').eq('id', courseId).single();
    expect(data.status).toBe('draft');
  });

  it('rejects a duplicate slug', async () => {
    const { data: existing } = await svc.from('courses').select('slug').eq('id', courseId).single();
    const { error } = await svc.from('courses')
      .insert({ slug: existing.slug, title: 'Clash', created_by: trainer.id });
    expect(error).not.toBeNull();
  });

  it('rejects an invalid course status', async () => {
    const { error } = await svc.from('courses').update({ status: 'live' }).eq('id', courseId);
    expect(error.message).toMatch(/invalid input value for enum/i);
  });

  it('rejects two modules at the same position in one course', async () => {
    const { error } = await svc.from('modules')
      .insert({ course_id: courseId, title: 'Clash', position: 1 });
    expect(error).not.toBeNull();
  });

  it('accepts a well-formed flashcards activity', async () => {
    const { error } = await svc.from('activities').insert({
      module_id: moduleId, type: 'flashcards', title: 'Keywords', position: 1, xp: 12,
      content: { cards: [{ front: 'a', back: 'b' }] },
    });
    expect(error).toBeNull();
  });

  it('REJECTS a flashcards activity with no cards key', async () => {
    const { error } = await svc.from('activities').insert({
      module_id: moduleId, type: 'flashcards', title: 'Broken', position: 2,
      content: { nope: true },
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/violates check constraint/i);
  });

  it('REJECTS a scenario activity with no steps key', async () => {
    const { error } = await svc.from('activities').insert({
      module_id: moduleId, type: 'scenario', title: 'Broken', position: 3, content: {},
    });
    expect(error).not.toBeNull();
  });

  it('accepts a quiz activity with no content payload', async () => {
    const { error } = await svc.from('activities').insert({
      module_id: moduleId, type: 'quiz', title: 'Mini Quiz', position: 4, content: {},
    });
    expect(error).toBeNull();
  });

  it('cascades modules and activities when the course is deleted', async () => {
    const { data: c } = await svc.from('courses')
      .insert({ slug: `tmp-${Date.now()}`, title: 'Temp', created_by: trainer.id }).select().single();
    const { data: m } = await svc.from('modules')
      .insert({ course_id: c.id, title: 'M', position: 1 }).select().single();
    await svc.from('activities').insert({
      module_id: m.id, type: 'reading', title: 'R', position: 1, content: { body: 'x' },
    });
    await svc.from('courses').delete().eq('id', c.id);
    const { data: mods } = await svc.from('modules').select('id').eq('course_id', c.id);
    expect(mods ?? []).toHaveLength(0);
  });

  it('stores a course material row', async () => {
    const { error } = await svc.from('course_materials').insert({
      course_id: courseId, name: 'H&S Manual', kind: 'pdf',
      storage_path: `${courseId}/manual.pdf`, size_bytes: 2400000, uploaded_by: trainer.id,
    });
    expect(error).toBeNull();
  });

  it('rejects a material that is neither a file nor a link', async () => {
    const { error } = await svc.from('course_materials').insert({
      course_id: courseId, name: 'Nothing', kind: 'pdf',
    });
    expect(error).not.toBeNull();
  });

  it('rejects a material that is both a file and a link', async () => {
    const { error } = await svc.from('course_materials').insert({
      course_id: courseId, name: 'Both', kind: 'link',
      storage_path: 'x/y.pdf', external_url: 'https://example.com',
    });
    expect(error).not.toBeNull();
  });
});
