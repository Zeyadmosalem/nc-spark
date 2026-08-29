// Badges and the course leaderboard, against the live project.
//
// The leaderboard is a SECURITY DEFINER view, which means it reads past RLS
// and decides for itself who may see what. That is the right shape — xp_events
// is readable only by its owner, so an invoker view would show a trainee a
// leaderboard of one — but it puts the whole access decision inside one WHERE
// clause. These tests are what stop that clause quietly widening.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, uniqueEmail, applyAppEnv, becomeWith } from './helpers.js';

applyAppEnv();

const { supabase } = await import('../../src/api/client.js');

const svc = serviceClient();
const PASSWORD = 'Test-Passw0rd!';

const become = becomeWith(supabase, PASSWORD);
const PREFIX = `bdg${Date.now()}`;

let trainer, otherTrainer, supervisor, admin, alice, bob, outsider;
const madeUsers = [];
let courseId, otherCourseId, aliceEnrolment;
const acts = [];

function must(what, { data, error }) {
  if (error) throw new Error(`fixture ${what}: ${error.message}`);
  if (!data) throw new Error(`fixture ${what}: no row returned`);
  return data;
}

async function mk(role, name) {
  const u = await createUser({ email: uniqueEmail(), role, name });
  madeUsers.push(u.id);
  return u;
}

const badgesOf = async (id) => ((await svc
  .from('trainee_badges').select('badge_code').eq('trainee_id', id)).data ?? [])
  .map((r) => r.badge_code).sort();

beforeAll(async () => {
  trainer = await mk('trainer', 'Tara Trainer');
  otherTrainer = await mk('trainer', 'Owen Other');
  supervisor = await mk('supervisor', 'Sam Super');
  admin = await mk('admin', 'Ada Admin');
  alice = await mk('trainee', 'Alice Ahmed');
  bob = await mk('trainee', 'Bob Brown');
  outsider = await mk('trainee', 'Olive Outside');

  await svc.from('supervisor_trainers')
    .insert({ supervisor_id: supervisor.id, trainer_id: trainer.id });

  courseId = must('course', await svc.from('courses').insert({
    slug: `${PREFIX}-course`, title: 'Badge Course', status: 'published',
    trainer_id: trainer.id, created_by: admin.id,
  }).select().single()).id;

  otherCourseId = must('other course', await svc.from('courses').insert({
    slug: `${PREFIX}-other`, title: 'Other Course', status: 'published',
    trainer_id: otherTrainer.id, created_by: admin.id,
  }).select().single()).id;

  const mod = must('module', await svc.from('modules')
    .insert({ course_id: courseId, title: 'One', position: 1 }).select().single());

  for (let i = 1; i <= 12; i += 1) {
    acts.push(must('activity', await svc.from('activities').insert({
      module_id: mod.id, type: 'reading', title: `Lesson ${i}`, position: i,
      content: { body: 'x' }, xp: 10,
    }).select().single()).id);
  }

  aliceEnrolment = must('alice enrolment', await svc.from('enrollments')
    .insert({ trainee_id: alice.id, course_id: courseId, status: 'active' })
    .select().single()).id;

  must('bob enrolment', await svc.from('enrollments')
    .insert({ trainee_id: bob.id, course_id: courseId, status: 'active' })
    .select().single());

  must('outsider enrolment', await svc.from('enrollments')
    .insert({ trainee_id: outsider.id, course_id: otherCourseId, status: 'active' })
    .select().single());
}, 120000);

afterAll(async () => {
  await supabase.auth.signOut();
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  for (const id of madeUsers) {
    await svc.auth.admin.deleteUser(id).catch(() => null);
  }
});

describe('earning a badge', () => {
  it('gives nothing before anything is done', async () => {
    expect(await badgesOf(alice.id)).toEqual([]);
  });

  it('awards first steps on the first activity', async () => {
    await svc.from('activity_completions')
      .insert({ enrollment_id: aliceEnrolment, activity_id: acts[0] });

    expect(await badgesOf(alice.id)).toEqual(['first_steps']);
  });

  it('awards contributor for joining the conversation', async () => {
    await svc.from('messages')
      .insert({ course_id: courseId, user_id: alice.id, body: 'A question.' });

    expect(await badgesOf(alice.id)).toContain('contributor');
  });

  /** 10 activities at 10 XP crosses 100. */
  it('awards century when the total gets there', async () => {
    expect(await badgesOf(alice.id)).not.toContain('century');

    for (let i = 1; i < 10; i += 1) {
      await svc.from('activity_completions')
        .insert({ enrollment_id: aliceEnrolment, activity_id: acts[i] });
    }

    expect(await badgesOf(alice.id)).toContain('century');
  });

  it('does not award five hundred on the way past a hundred', async () => {
    expect(await badgesOf(alice.id)).not.toContain('five_hundred');
  });

  /**
   * Finishing a course is not an XP award, so it has its own trigger. Without
   * it the badge would arrive on the trainee's NEXT award, which for somebody
   * who just finished their last course may be never.
   */
  it('awards finisher when the enrolment completes', async () => {
    expect(await badgesOf(alice.id)).not.toContain('finisher');

    // Check the write landed. The first version of this test did not, and a
    // trigger that RAISED — taking the whole UPDATE with it — presented as a
    // badge rule that simply had not fired.
    const { error } = await svc.from('enrollments')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', aliceEnrolment);
    expect(error).toBeNull();

    const { data: after } = await svc.from('enrollments')
      .select('status').eq('id', aliceEnrolment).single();
    expect(after.status).toBe('completed');

    expect(await badgesOf(alice.id)).toContain('finisher');
  });

  it('awards a badge once, however often it is re-earned', async () => {
    await svc.from('messages')
      .insert({ course_id: courseId, user_id: alice.id, body: 'Another.' });

    const codes = await badgesOf(alice.id);
    expect(codes.filter((c) => c === 'contributor')).toHaveLength(1);
  });

  it('gives Bob nothing for what Alice did', async () => {
    expect(await badgesOf(bob.id)).toEqual([]);
  });
});

describe('who may read a badge', () => {
  it('lets a trainee see their own', async () => {
    await become(alice.email);
    const { data } = await supabase.from('trainee_badges').select('badge_code');
    expect(data.length).toBeGreaterThan(0);
  });

  it('does not let one trainee read another\'s', async () => {
    await become(bob.email);
    const { data } = await supabase.from('trainee_badges').select('trainee_id');
    expect(data.some((r) => r.trainee_id === alice.id)).toBe(false);
  });

  it('lets the course trainer see them', async () => {
    await become(trainer.email);
    const { data } = await supabase.from('trainee_badges').select('trainee_id');
    expect(data.some((r) => r.trainee_id === alice.id)).toBe(true);
  });

  it('shows the catalog to everybody', async () => {
    await become(bob.email);
    const { data } = await supabase.from('badges').select('code');
    expect(data.length).toBe(7);
  });
});

describe('the course leaderboard', () => {
  it('ranks the people on the course', async () => {
    await become(alice.email);
    const { data, error } = await supabase
      .from('course_leaderboard')
      .select('trainee_id, name, xp, position')
      .eq('course_id', courseId)
      .order('position');

    expect(error).toBeNull();
    expect(data[0]).toMatchObject({ trainee_id: alice.id, name: 'Alice Ahmed', position: 1 });
    expect(data[0].xp).toBeGreaterThan(0);
    // Bob is on the course having earned nothing, and still appears.
    expect(data.map((r) => r.trainee_id)).toContain(bob.id);
  });

  /**
   * The whole reason the view is definer. xp_events is readable only by its
   * owner, so an invoker view would show a trainee a leaderboard containing
   * one person — themselves — which is not a leaderboard.
   */
  it('shows a trainee their classmates, not just themselves', async () => {
    await become(bob.email);
    const { data } = await supabase
      .from('course_leaderboard').select('trainee_id').eq('course_id', courseId);
    expect(data.length).toBe(2);
    expect(data.some((r) => r.trainee_id === alice.id)).toBe(true);
  });

  /** And the limit of it: a definer view has to decide this itself. */
  it('shows nothing for a course the reader is not on', async () => {
    await become(outsider.email);
    const { data } = await supabase
      .from('course_leaderboard').select('trainee_id').eq('course_id', courseId);
    expect(data).toEqual([]);
  });

  it('shows nothing to a trainer of a different course', async () => {
    await become(otherTrainer.email);
    const { data } = await supabase
      .from('course_leaderboard').select('trainee_id').eq('course_id', courseId);
    expect(data).toEqual([]);
  });

  it('shows it to the course trainer and to a supervisor of theirs', async () => {
    await become(trainer.email);
    expect((await supabase.from('course_leaderboard')
      .select('trainee_id').eq('course_id', courseId)).data.length).toBe(2);

    await become(supervisor.email);
    expect((await supabase.from('course_leaderboard')
      .select('trainee_id').eq('course_id', courseId)).data.length).toBe(2);
  });

  /**
   * A peer sees a name and a total. No email, because it joins public_profiles
   * rather than profiles, and no per-award detail — you learn that somebody is
   * ahead, never what they did.
   */
  it('exposes no contact details or award detail', async () => {
    await become(bob.email);
    const { data } = await supabase
      .from('course_leaderboard').select('*').eq('course_id', courseId);

    for (const row of data) {
      expect(row).not.toHaveProperty('email');
      expect(row).not.toHaveProperty('kind');
      expect(Object.keys(row).sort())
        .toEqual(['avatar', 'course_id', 'name', 'position', 'trainee_id', 'xp']);
    }
  });

  it('cannot be written to', async () => {
    await become(alice.email);
    const { error } = await supabase.from('course_leaderboard')
      .insert({ course_id: courseId, trainee_id: alice.id, xp: 99999 });
    expect(error).toBeTruthy();
  });
});
