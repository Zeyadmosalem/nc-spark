import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
const PREFIX = `sto${Date.now()}`;
let trainer, otherTrainer, trainee, stranger;
let cTrainer, cOther, cTrainee, cStranger;
let courseId, otherCourseId;

const file = () => new Blob(['hello'], { type: 'text/plain' });

beforeAll(async () => {
  await resetDb();
  trainer      = await createUser({ email: uniqueEmail(), role: 'trainer' });
  otherTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee      = await createUser({ email: uniqueEmail(), role: 'trainee' });
  stranger     = await createUser({ email: uniqueEmail(), role: 'trainee' });

  const { data: c } = await svc.from('courses').insert({
    slug: `${PREFIX}-1`, title: 'Storage Course', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();
  courseId = c.id;

  // A second course, owned by the OTHER trainer, to move files towards.
  const { data: c2 } = await svc.from('courses').insert({
    slug: `${PREFIX}-2`, title: 'Other Course', status: 'published',
    trainer_id: otherTrainer.id, created_by: otherTrainer.id,
  }).select().single();
  otherCourseId = c2.id;

  await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: courseId, status: 'active' });

  [cTrainer, cOther, cTrainee, cStranger] = await Promise.all([
    signIn(trainer.email), signIn(otherTrainer.email),
    signIn(trainee.email), signIn(stranger.email),
  ]);
});
afterAll(async () => {
  await svc.storage.from('course-materials').remove([
    `${courseId}/manual.txt`, `${otherCourseId}/stolen.txt`,
  ]);
  await svc.storage.from('submissions').remove([
    `${courseId}/${trainee.id}/work.txt`, `${courseId}/${stranger.id}/forged.txt`,
  ]);
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  await resetDb();
});

describe('course-materials bucket', () => {
  it('the owning trainer can upload', async () => {
    const { error } = await cTrainer.storage.from('course-materials')
      .upload(`${courseId}/manual.txt`, file(), { upsert: true });
    expect(error).toBeNull();
  });

  it('REJECTS an upload from another trainer', async () => {
    const { error } = await cOther.storage.from('course-materials')
      .upload(`${courseId}/stolen.txt`, file(), { upsert: true });
    expect(error).not.toBeNull();
  });

  it('REJECTS an upload from a trainee', async () => {
    const { error } = await cTrainee.storage.from('course-materials')
      .upload(`${courseId}/cheat.txt`, file(), { upsert: true });
    expect(error).not.toBeNull();
  });

  it('an enrolled trainee can download', async () => {
    const { error } = await cTrainee.storage.from('course-materials')
      .download(`${courseId}/manual.txt`);
    expect(error).toBeNull();
  });

  it('an UNENROLLED user cannot download', async () => {
    const { error } = await cStranger.storage.from('course-materials')
      .download(`${courseId}/manual.txt`);
    expect(error).not.toBeNull();
  });

  // USING decides which rows may be updated; WITH CHECK decides what they may
  // become. Without the latter a trainer can rename their own file into a
  // course they do not own, which is an upload they were never allowed to make.
  it('REJECTS moving a material into a course the trainer does not own', async () => {
    const { error } = await cTrainer.storage.from('course-materials')
      .move(`${courseId}/manual.txt`, `${otherCourseId}/stolen.txt`);
    expect(error).not.toBeNull();
    const { error: stillThere } = await cTrainer.storage.from('course-materials')
      .download(`${courseId}/manual.txt`);
    expect(stillThere).toBeNull();
  });

  it('rejects a path whose first segment is not a course id', async () => {
    const { error } = await cTrainer.storage.from('course-materials')
      .upload('not-a-uuid/rogue.txt', file(), { upsert: true });
    expect(error).not.toBeNull();
  });
});

describe('submissions bucket', () => {
  it('the owning trainee can upload under their own prefix', async () => {
    const { error } = await cTrainee.storage.from('submissions')
      .upload(`${courseId}/${trainee.id}/work.txt`, file(), { upsert: true });
    expect(error).toBeNull();
  });

  it('REJECTS a trainee uploading under ANOTHER trainee prefix', async () => {
    const { error } = await cTrainee.storage.from('submissions')
      .upload(`${courseId}/${stranger.id}/forged.txt`, file(), { upsert: true });
    expect(error).not.toBeNull();
  });

  it('the owning trainee can download their own submission', async () => {
    const { error } = await cTrainee.storage.from('submissions')
      .download(`${courseId}/${trainee.id}/work.txt`);
    expect(error).toBeNull();
  });

  it('the course trainer can download a submission', async () => {
    const { error } = await cTrainer.storage.from('submissions')
      .download(`${courseId}/${trainee.id}/work.txt`);
    expect(error).toBeNull();
  });

  it('REJECTS another trainee downloading it', async () => {
    const { error } = await cStranger.storage.from('submissions')
      .download(`${courseId}/${trainee.id}/work.txt`);
    expect(error).not.toBeNull();
  });

  it('REJECTS an unrelated trainer downloading it', async () => {
    const { error } = await cOther.storage.from('submissions')
      .download(`${courseId}/${trainee.id}/work.txt`);
    expect(error).not.toBeNull();
  });

  it('REJECTS moving a submission under another trainee prefix', async () => {
    const { error } = await cTrainee.storage.from('submissions')
      .move(`${courseId}/${trainee.id}/work.txt`, `${courseId}/${stranger.id}/forged.txt`);
    expect(error).not.toBeNull();
    const { error: stillMine } = await cTrainee.storage.from('submissions')
      .download(`${courseId}/${trainee.id}/work.txt`);
    expect(stillMine).toBeNull();
  });

  // This is the one case WITH CHECK actually decides. Postgres falls back to
  // USING for the new row when WITH CHECK is absent, and USING only asserts
  // that the folder is yours — which stays true after you leave the course.
  // WITH CHECK also demands is_enrolled, so a withdrawn trainee can no longer
  // rewrite the work their assessment was based on.
  // A move is a bare UPDATE, so it is the only operation WITH CHECK decides
  // here; an upsert over an existing path routes through the INSERT policy,
  // which already demands is_enrolled.
  it('REJECTS renaming a submission after the enrollment is withdrawn', async () => {
    const leaver = await createUser({ email: uniqueEmail(), role: 'trainee' });
    const { data: e } = await svc.from('enrollments')
      .insert({ trainee_id: leaver.id, course_id: courseId, status: 'active' })
      .select().single();
    const cLeaver = await signIn(leaver.email);
    const from = `${courseId}/${leaver.id}/thesis.txt`;
    const to   = `${courseId}/${leaver.id}/thesis-v2.txt`;

    const first = await cLeaver.storage.from('submissions').upload(from, file(), { upsert: true });
    expect(first.error).toBeNull();

    await svc.from('enrollments').update({ status: 'withdrawn' }).eq('id', e.id);

    const { error } = await cLeaver.storage.from('submissions').move(from, to);
    expect(error).not.toBeNull();

    await svc.storage.from('submissions').remove([from, to]);
  });
});
