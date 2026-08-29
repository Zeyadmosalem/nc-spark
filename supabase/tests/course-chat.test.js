// Course chat, through the api the browser actually calls.
//
// This feature shipped with no test of any kind — no unit, no component, no
// live one — which for the newest thing in the product and the only one where
// users talk to each other is the wrong place to have no safety net.
//
// Live rather than mocked for the two reasons that keep recurring here:
//
// 1. The embed. `public_profiles!messages_user_id_fkey(...)` is a string only
//    PostgREST can validate, and getting it wrong is a 400 at runtime and a
//    passing unit test. The support inbox already shipped every staff reply as
//    "Unknown" because a trainee cannot read `profiles`; chat resolves names
//    the same way and would fail the same way.
// 2. Who may read a thread is entirely RLS. `can_view_course_chat` is admin OR
//    the course's trainer OR an active enrolment — and a mocked `from()`
//    cannot fail that check either way.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  serviceClient, anonClient, createUser, uniqueEmail, applyAppEnv, becomeWith,
  must, mustWrite,
} from './helpers.js';

applyAppEnv();

const { supabase } = await import('../../src/api/client.js');
const { listCourseMessages, sendCourseMessage, MESSAGE_PAGE_SIZE } =
  await import('../../src/api/messages.js');

const svc = serviceClient();
const PASSWORD = 'Test-Passw0rd!';

const become = becomeWith(supabase, PASSWORD);
const PREFIX = `chat${Date.now()}`;

let trainer, otherTrainer, admin, supervisor, alice, bob, pending;
const madeUsers = [];
let courseId, otherCourseId;

async function mk(role, name, status = 'active') {
  const u = await createUser({ email: uniqueEmail(), role, name });
  madeUsers.push(u.id);
  if (status !== 'active') {
    await mustWrite('update profiles', svc.from('profiles').update({ status }).eq('id', u.id));
  }
  return u;
}

beforeAll(async () => {
  trainer = await mk('trainer', 'Tara Trainer');
  otherTrainer = await mk('trainer', 'Owen Other');
  admin = await mk('admin', 'Ada Admin');
  supervisor = await mk('supervisor', 'Sam Super');
  alice = await mk('trainee', 'Alice Ahmed');
  bob = await mk('trainee', 'Bob Brown');
  pending = await mk('trainee', 'Pat Pending', 'pending');

  const course = must('course', await svc.from('courses').insert({
    slug: `${PREFIX}-course`, title: 'Chat Course', status: 'published',
    trainer_id: trainer.id, created_by: admin.id,
  }).select().single());
  courseId = course.id;

  const other = must('other course', await svc.from('courses').insert({
    slug: `${PREFIX}-other`, title: 'Other Course', status: 'published',
    trainer_id: otherTrainer.id, created_by: admin.id,
  }).select().single());
  otherCourseId = other.id;

  // Alice is on the course. Bob is not — he is the control for every
  // "an outsider cannot" case below.
  must('enrollment', await svc.from('enrollments')
    .insert({ trainee_id: alice.id, course_id: courseId, status: 'active' })
    .select().single());

  // Pat is enrolled but the account is pending, which is a different refusal:
  // membership is satisfied and app.is_active() is not.
  must('pending enrollment', await svc.from('enrollments')
    .insert({ trainee_id: pending.id, course_id: courseId, status: 'active' })
    .select().single());
}, 120000);

afterAll(async () => {
  await supabase.auth.signOut();
  await mustWrite('delete courses', svc.from('courses').delete().like('slug', `${PREFIX}-%`));
  for (const id of madeUsers) {
    await svc.auth.admin.deleteUser(id).catch(() => null);
  }
});

describe('the people on a course', () => {
  it('lets an enrolled trainee post and read it back', async () => {
    await become(alice.email);
    const sent = await sendCourseMessage({ courseId, body: 'When is the deadline?' });
    expect(sent.body).toBe('When is the deadline?');

    const all = await listCourseMessages(courseId);
    expect(all.map((m) => m.body)).toContain('When is the deadline?');
  });

  it('lets the course trainer reply', async () => {
    await become(trainer.email);
    await sendCourseMessage({ courseId, body: 'Friday.' });

    const all = await listCourseMessages(courseId);
    expect(all.map((m) => m.body)).toContain('Friday.');
  });

  it('lets an admin in', async () => {
    await become(admin.email);
    expect((await listCourseMessages(courseId)).length).toBeGreaterThanOrEqual(2);
  });

  /**
   * The support inbox shipped showing every staff reply as "Unknown" because a
   * trainee cannot read `profiles` — and should not, since it carries the
   * email. public_profiles is the view built for exactly this. A trainee
   * reading their trainer's name is the case that catches it.
   */
  it('names the trainer to the trainee reading the thread', async () => {
    await become(alice.email);
    const all = await listCourseMessages(courseId);
    const fromTrainer = all.find((m) => m.userId === trainer.id);

    expect(fromTrainer.senderName).toBe('Tara Trainer');
    expect(fromTrainer.senderRole).toBe('trainer');
    expect(fromTrainer.senderName).not.toBe('Unknown user');
  });

  it('keeps messages in the order they were written', async () => {
    await become(alice.email);
    const all = await listCourseMessages(courseId);
    const times = all.map((m) => new Date(m.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe('everybody else', () => {
  /**
   * Not vacuous: the identical call returns the thread for Alice above. This
   * is empty rather than forbidden because a filtered SELECT has nothing to
   * deny — the rows simply are not visible.
   */
  it('shows nothing to a trainee who is not enrolled', async () => {
    await become(bob.email);
    expect(await listCourseMessages(courseId)).toEqual([]);
  });

  it('refuses a message from a trainee who is not enrolled', async () => {
    await become(bob.email);
    await expect(sendCourseMessage({ courseId, body: 'Let me in.' }))
      .rejects.toThrow();
  });

  it('shows nothing to a trainer of a different course', async () => {
    await become(otherTrainer.email);
    expect(await listCourseMessages(courseId)).toEqual([]);
  });

  /**
   * Supervisors oversee trainers, and can_view_course_chat does not name them.
   * Recorded here so that if it ever becomes deliberate to include them, this
   * test is what has to be changed on purpose rather than discovered.
   */
  it('shows nothing to a supervisor', async () => {
    await become(supervisor.email);
    expect(await listCourseMessages(courseId)).toEqual([]);
  });

  /** Enrolled, but the account is not active yet. */
  it('refuses a message from a pending account', async () => {
    await become(pending.email);
    await expect(sendCourseMessage({ courseId, body: 'Hello?' }))
      .rejects.toThrow();
  });

  it('keeps one course\'s chat out of another', async () => {
    await become(alice.email);
    expect(await listCourseMessages(otherCourseId)).toEqual([]);
  });
});

describe('what the insert grant refuses', () => {
  /**
   * `user_id = auth.uid()` in the WITH CHECK. Without it a member of the
   * course could post words under another member's name, which in a thread a
   * trainer moderates is the whole integrity of the record.
   */
  it('will not let one person post as another', async () => {
    await become(alice.email);
    const { error } = await supabase.from('messages')
      .insert({ course_id: courseId, user_id: trainer.id, body: 'Not me.' });
    expect(error).toBeTruthy();
  });

  /** No UPDATE or DELETE grant: a sent message is a record, not a draft. */
  it('will not let anybody edit or delete a message', async () => {
    await become(alice.email);
    const mine = (await listCourseMessages(courseId)).find((m) => m.userId === alice.id);

    const { error: updateErr } = await supabase.from('messages')
      .update({ body: 'Rewritten.' }).eq('id', mine.id);
    expect(updateErr).toBeTruthy();

    await supabase.from('messages').delete().eq('id', mine.id);
    const still = await listCourseMessages(courseId);
    expect(still.map((m) => m.id)).toContain(mine.id);
  });

  it('refuses an empty message', async () => {
    await become(alice.email);
    await expect(sendCourseMessage({ courseId, body: '   ' })).rejects.toThrow();
  });

  /**
   * The column is `check (length(body) <= 4000)`. Until the api enforced it
   * too, a long message reached the database and came back as a raw constraint
   * violation with the constraint's name in it.
   */
  it('refuses a message longer than the column allows', async () => {
    await become(alice.email);
    // The message a person sees, not the constraint's name.
    await expect(sendCourseMessage({ courseId, body: 'x'.repeat(4001) }))
      .rejects.toThrow(/4000 characters/i);
  });

  it('accepts a message exactly at the limit', async () => {
    await become(alice.email);
    const sent = await sendCourseMessage({ courseId, body: 'y'.repeat(4000) });
    expect(sent.body).toHaveLength(4000);
  });
});

describe('a long conversation', () => {
  // A course of its own, so the counts here cannot be disturbed by the
  // messages the tests above wrote.
  let busyCourseId;
  const TOTAL = MESSAGE_PAGE_SIZE + 10;

  beforeAll(async () => {
    const course = must('busy course', await svc.from('courses').insert({
      slug: `${PREFIX}-busy`, title: 'Busy Course', status: 'published',
      trainer_id: trainer.id, created_by: admin.id,
    }).select().single());
    busyCourseId = course.id;

    must('busy enrollment', await svc.from('enrollments')
      .insert({ trainee_id: alice.id, course_id: busyCourseId, status: 'active' })
      .select().single());

    // Explicit timestamps: created_at defaults to now(), and a bulk insert
    // lands them close enough together that the order would be arbitrary.
    const base = Date.now() - TOTAL * 60000;
    must('messages', await svc.from('messages').insert(
      Array.from({ length: TOTAL }, (_, i) => ({
        course_id: busyCourseId,
        user_id: alice.id,
        body: `message ${i}`,
        created_at: new Date(base + i * 60000).toISOString(),
      })),
    ).select());
  }, 120000);

  it('returns one page rather than the whole history', async () => {
    await become(alice.email);
    expect(await listCourseMessages(busyCourseId))
      .toHaveLength(MESSAGE_PAGE_SIZE);
  });

  /**
   * The bug a naive `.limit()` introduces: ordering ascending and taking the
   * first 50 keeps the OLDEST messages, so the tab opens on a conversation
   * from months ago and the newest message is unreachable.
   */
  it('keeps the newest end of the conversation', async () => {
    await become(alice.email);
    const page = await listCourseMessages(busyCourseId);

    expect(page.at(-1).body).toBe(`message ${TOTAL - 1}`);
    expect(page.map((m) => m.body)).not.toContain('message 0');
  });

  it('still reads oldest-first within the page', async () => {
    await become(alice.email);
    const times = (await listCourseMessages(busyCourseId))
      .map((m) => new Date(m.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('reaches the older messages behind a page', async () => {
    await become(alice.email);
    const page = await listCourseMessages(busyCourseId);
    const older = await listCourseMessages(busyCourseId, { before: page[0].createdAt });

    expect(older).toHaveLength(10);
    expect(older.map((m) => m.body)).toContain('message 0');
    // No overlap: the two pages are disjoint.
    const ids = new Set(page.map((m) => m.id));
    expect(older.some((m) => ids.has(m.id))).toBe(false);
  });
});

describe('live delivery', () => {
  /**
   * Waits for one realtime INSERT, or gives up.
   *
   * The wait is generous because it has to cover a slow socket open as well as
   * a slow delivery, and the it() timeout above it is larger still, so this
   * fails as a failure rather than as a hang.
   *
   * It does NOT compete with other files. An earlier version of this comment
   * blamed "three other live files running"; vitest.db.config.js sets
   * fileParallelism: false, so exactly one file runs at a time and always has.
   */
  const waitForMessage = (channel, ms = 25000) => new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    channel.on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => { clearTimeout(timer); resolve(payload.new); });
  });

  const subscribed = (channel) => new Promise((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve(channel);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
    });
  });

  /**
   * The whole point of the publication: a member of the course is told about a
   * message without having to reload.
   *
   * Attempted more than once on purpose, and this is the reason.
   *
   * postgres_changes is BEST EFFORT. Realtime polls the WAL and caps how many
   * changes it takes per poll; the overflow is dropped, not queued. Measured
   * against this project: 10/10 delivered on a quiet database, 5/10 while
   * something else was inserting in bulk. The failure this replaces looked
   * like a broken subscription and was not one — the socket was connected, the
   * channel joined, the insert landed and RLS granted the reader the row, and
   * the event simply never came.
   *
   * So a single miss says nothing. Three consecutive misses do: that is a
   * subscription that is not entitled to the rows, which is what this test is
   * actually for. A reader off the course still sees nothing, three times over.
   */
  it('reaches a member of the course', async () => {
    await become(alice.email);

    let row = null;
    for (let attempt = 1; attempt <= 3 && !row; attempt += 1) {
      const channel = supabase.channel(`test-in-${Date.now()}-${attempt}`);
      const arrived = waitForMessage(channel, 10000);
      await subscribed(channel);

      // Checked, because the insert is the other half of this test. Unchecked,
      // a write that never happened and a delivery that never arrived fail
      // identically — "expected null to be truthy" — and send you to the
      // socket either way.
      const { error: insertErr } = await svc.from('messages').insert({
        course_id: courseId, user_id: trainer.id, body: 'Live delivery works.',
      });
      expect(insertErr, 'the message this test waits for was never written').toBeNull();

      row = await arrived;
      await supabase.removeChannel(channel);
    }

    expect(row, 'subscribed and the insert landed three times, and nothing arrived')
      .toBeTruthy();
    expect(row.body).toBe('Live delivery works.');
  }, 60000);

  /**
   * And the claim the migration makes: publishing a table does not publish it
   * to everybody. Realtime evaluates messages_select for the subscriber, so
   * Bob — who is not enrolled — must receive nothing at all.
   *
   * This used to say "not vacuous: the identical subscription delivers the row
   * to Alice above", and that was wrong. Alice's delivery happened in a
   * different test, against a different insert; it said nothing about whether
   * THIS message reached anyone. postgres_changes is best effort — see the
   * note above — so a dropped change made this pass, and it would have passed
   * just the same if RLS had stopped filtering altogether, which is the one
   * thing it exists to catch.
   *
   * So Alice is now subscribed to the SAME insert, on her own client. An
   * attempt only counts once she has demonstrably received it; then Bob
   * receiving nothing is the filter rather than a drop. Verified by enrolling
   * Bob and watching this fail.
   */
  it('does not reach somebody who is not on the course', async () => {
    await become(alice.email);

    const outsider = anonClient();
    const { data: bobSession, error: signInErr } = await outsider.auth
      .signInWithPassword({ email: bob.email, password: PASSWORD });
    expect(signInErr).toBeNull();
    await outsider.realtime.setAuth(bobSession.session.access_token);

    let delivered = null;
    let reachedBob = 'no attempt completed';
    try {
      for (let attempt = 1; attempt <= 3 && !delivered; attempt += 1) {
        const memberCh = supabase.channel(`test-ctl-${Date.now()}-${attempt}`);
        const outsiderCh = outsider.channel(`test-out-${Date.now()}-${attempt}`);
        const memberGot = waitForMessage(memberCh, 10000);
        const outsiderGot = waitForMessage(outsiderCh, 10000);
        await Promise.all([subscribed(memberCh), subscribed(outsiderCh)]);

        const { error: insertErr } = await svc.from('messages').insert({
          course_id: courseId, user_id: trainer.id, body: 'Not for Bob.',
        });
        expect(insertErr).toBeNull();

        [delivered, reachedBob] = await Promise.all([memberGot, outsiderGot]);
        await supabase.removeChannel(memberCh);
        await outsider.removeChannel(outsiderCh);
      }
    } finally {
      await outsider.auth.signOut({ scope: 'local' });
    }

    expect(delivered, 'the control never received it, so Bob receiving nothing proves nothing')
      .toBeTruthy();
    expect(reachedBob).toBeNull();
  }, 60000);
});
