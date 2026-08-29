import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  serviceClient, anonClient, createUser, signIn, resetDb, uniqueEmail,
  mustWrite,
} from './helpers.js';

const svc = serviceClient();
let admin, ownerTrainer, otherTrainer, trainee, outsider;
let cAdmin, cOwner, cOther, cTrainee, cOutsider;
let publishedId, draftId, moduleId;

beforeAll(async () => {
  await resetDb();
  admin        = await createUser({ email: uniqueEmail(), role: 'admin' });
  ownerTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  otherTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee      = await createUser({ email: uniqueEmail(), role: 'trainee' });
  outsider     = await createUser({ email: uniqueEmail(), role: 'trainee' });

  const { data: pub } = await svc.from('courses').insert({
    slug: `pub-${Date.now()}`, title: 'Published Course', status: 'published',
    trainer_id: ownerTrainer.id, created_by: admin.id,
  }).select().single();
  publishedId = pub.id;

  const { data: dft } = await svc.from('courses').insert({
    slug: `dft-${Date.now()}`, title: 'Draft Course', status: 'draft',
    trainer_id: ownerTrainer.id, created_by: admin.id,
  }).select().single();
  draftId = dft.id;

  const { data: m } = await svc.from('modules')
    .insert({ course_id: publishedId, title: 'M1', position: 1 }).select().single();
  moduleId = m.id;
  await mustWrite('insert activities', svc.from('activities').insert({
    module_id: moduleId, type: 'reading', title: 'Read', position: 1, content: { body: 'x' },
  }));
  await mustWrite('insert enrollments', svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: publishedId, status: 'active' }));

  [cAdmin, cOwner, cOther, cTrainee, cOutsider] = await Promise.all([
    signIn(admin.email), signIn(ownerTrainer.email), signIn(otherTrainer.email),
    signIn(trainee.email), signIn(outsider.email),
  ]);
});
afterAll(async () => {
  await mustWrite('delete courses', svc.from('courses').delete().in('id', [publishedId, draftId]));
  await resetDb();
});

describe('course visibility', () => {
  it('an anonymous visitor sees no courses', async () => {
    const { data } = await anonClient().from('courses').select('id');
    expect(data ?? []).toHaveLength(0);
  });

  it('any signed-in user sees a published course', async () => {
    const { data } = await cOutsider.from('courses').select('id').eq('id', publishedId);
    expect(data).toHaveLength(1);
  });

  it('a trainee does NOT see a draft course', async () => {
    const { data } = await cTrainee.from('courses').select('id').eq('id', draftId);
    expect(data ?? []).toHaveLength(0);
  });

  it('the owning trainer sees their own draft', async () => {
    const { data } = await cOwner.from('courses').select('id').eq('id', draftId);
    expect(data).toHaveLength(1);
  });

  it('another trainer does NOT see that draft', async () => {
    const { data } = await cOther.from('courses').select('id').eq('id', draftId);
    expect(data ?? []).toHaveLength(0);
  });

  it('an admin sees drafts', async () => {
    const { data } = await cAdmin.from('courses').select('id').eq('id', draftId);
    expect(data).toHaveLength(1);
  });
});

describe('RED TEAM: course writes', () => {
  it('a trainee cannot create a course', async () => {
    const { error } = await cTrainee.from('courses')
      .insert({ slug: `evil-${Date.now()}`, title: 'Evil' });
    expect(error).not.toBeNull();
  });

  it('a trainee cannot edit a course', async () => {
    await cTrainee.from('courses').update({ title: 'Hacked' }).eq('id', publishedId);
    const { data } = await svc.from('courses').select('title').eq('id', publishedId).single();
    expect(data.title).toBe('Published Course');
  });

  it('a trainer cannot edit ANOTHER trainer course', async () => {
    await cOther.from('courses').update({ title: 'Stolen' }).eq('id', publishedId);
    const { data } = await svc.from('courses').select('title').eq('id', publishedId).single();
    expect(data.title).toBe('Published Course');
  });

  it('a trainer cannot publish their own course directly', async () => {
    await cOwner.from('courses').update({ status: 'published' }).eq('id', draftId);
    const { data } = await svc.from('courses').select('status').eq('id', draftId).single();
    expect(data.status).toBe('draft');
  });

  it('an ADMIN cannot create a course already published, bypassing the content check', async () => {
    const { error } = await cAdmin.from('courses')
      .insert({ slug: `pre-${Date.now()}`, title: 'Prepublished', status: 'published' });
    expect(error).not.toBeNull();
  });

  it('a trainer cannot reassign a course to themselves', async () => {
    const { data: orphan } = await svc.from('courses').insert({
      slug: `orph-${Date.now()}`, title: 'Orphan', created_by: admin.id,
    }).select().single();
    await cOther.from('courses').update({ trainer_id: otherTrainer.id }).eq('id', orphan.id);
    const { data } = await svc.from('courses').select('trainer_id').eq('id', orphan.id).single();
    expect(data.trainer_id).toBeNull();
    await mustWrite('delete courses', svc.from('courses').delete().eq('id', orphan.id));
  });

  it('a trainee cannot delete a course', async () => {
    await cTrainee.from('courses').delete().eq('id', publishedId);
    const { data } = await svc.from('courses').select('id').eq('id', publishedId);
    expect(data).toHaveLength(1);
  });
});

describe('legitimate catalog authoring', () => {
  it('the owning trainer can edit their course subtitle', async () => {
    const { error } = await cOwner.from('courses').update({ subtitle: 'Updated' }).eq('id', draftId);
    expect(error).toBeNull();
    const { data } = await svc.from('courses').select('subtitle').eq('id', draftId).single();
    expect(data.subtitle).toBe('Updated');
  });

  it('the owning trainer can add a module', async () => {
    const { error } = await cOwner.from('modules')
      .insert({ course_id: draftId, title: 'New Module', position: 1 });
    expect(error).toBeNull();
  });

  it('an admin can create a course, which starts as a draft', async () => {
    const slug = `adm-${Date.now()}`;
    const { error } = await cAdmin.from('courses').insert({ slug, title: 'Admin Course' });
    expect(error).toBeNull();
    const { data } = await svc.from('courses').select('status').eq('slug', slug).single();
    expect(data.status).toBe('draft');
    await mustWrite('delete courses', svc.from('courses').delete().eq('slug', slug));
  });
});

describe('activity and material visibility', () => {
  it('an enrolled trainee reads activities', async () => {
    const { data } = await cTrainee.from('activities').select('id').eq('module_id', moduleId);
    expect(data.length).toBeGreaterThan(0);
  });

  it('an UNENROLLED user cannot read activities of a published course', async () => {
    const { data } = await cOutsider.from('activities').select('id').eq('module_id', moduleId);
    expect(data ?? []).toHaveLength(0);
  });

  it('an unenrolled user CAN see modules, so the catalog can show an outline', async () => {
    const { data } = await cOutsider.from('modules').select('id').eq('course_id', publishedId);
    expect(data.length).toBeGreaterThan(0);
  });
});
