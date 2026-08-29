// Support threads, through the real api layer.
//
// Two reasons this has to run live:
//
// 1. The embeds. `profiles!support_requests_author_id_fkey(...)` is a string
//    only PostgREST can validate, and support_request_state is a grouped view
//    — this project has already shipped a milestone with a broken My Courses
//    page for assuming an embed on a view would work.
// 2. Who can see a thread. That is entirely RLS: a trainer reaches a request
//    tagged with a course they teach and nothing else, and a supervisor
//    reaches none at all. None of it is enforced by the api, so none of it can
//    be checked by a mocked test.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, uniqueEmail, applyAppEnv } from './helpers.js';

applyAppEnv();

const { supabase } = await import('../../src/api/client.js');
const {
  supportThreads, supportMessages, createSupportRequest,
  replyToSupportRequest, setSupportStatus, markSupportRead,
} = await import('../../src/api/support.js');

const svc = serviceClient();
const PASSWORD = 'Test-Passw0rd!';
const PREFIX = `sup${Date.now()}`;

let trainer, otherTrainer, admin, supervisor, alice, bob;
const madeUsers = [];
let courseId, otherCourseId;

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

async function become(email) {
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);
}

beforeAll(async () => {
  trainer = await mk('trainer', 'Tara Trainer');
  otherTrainer = await mk('trainer', 'Owen Other');
  admin = await mk('admin', 'Ada Admin');
  supervisor = await mk('supervisor', 'Sam Super');
  alice = await mk('trainee', 'Alice Ahmed');
  bob = await mk('trainee', 'Bob Brown');

  courseId = must('course', await svc.from('courses').insert({
    slug: `${PREFIX}-a`, title: 'Fire Safety', status: 'published',
    trainer_id: trainer.id, created_by: admin.id,
  }).select().single()).id;

  otherCourseId = must('other course', await svc.from('courses').insert({
    slug: `${PREFIX}-b`, title: 'Food Hygiene', status: 'published',
    trainer_id: otherTrainer.id, created_by: admin.id,
  }).select().single()).id;
}, 90000);

afterAll(async () => {
  await supabase.auth.signOut();
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  for (const id of madeUsers) {
    await svc.auth.admin.deleteUser(id).catch(() => null);
  }
});

describe('filing a request', () => {
  let request;

  beforeAll(async () => {
    await become(alice.email);
    request = await createSupportRequest({
      subject: 'Module 2 will not open',
      body: 'I finished everything in module 1 but the next one is still locked.',
      courseId,
    });
  });

  it('stores the subject and the opening message together', async () => {
    expect(request.subject).toBe('Module 2 will not open');
    const messages = await supportMessages(request.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toMatch(/still locked/);
    expect(messages[0].authorName).toBe('Alice Ahmed');
  });

  it('joins the author and the course through the embeds', async () => {
    const [thread] = await supportThreads();
    expect(thread.authorName).toBe('Alice Ahmed');
    expect(thread.courseTitle).toBe('Fire Safety');
    expect(thread.status).toBe('open');
  });

  /** The whole point of the view: which threads are waiting on somebody. */
  it('reports a fresh thread as waiting on staff', async () => {
    const [thread] = await supportThreads();
    expect(thread.awaitingStaff).toBe(true);
    expect(thread.hasReply).toBe(false);
    expect(thread.messageCount).toBe(1);
  });

  /**
   * author_id is set from auth.uid() by the WITH CHECK, not from the client.
   * Filing a complaint in somebody else's name is the obvious abuse here.
   */
  it('cannot be filed in another trainee\'s name', async () => {
    const { error } = await supabase.from('support_requests').insert({
      author_id: bob.id, course_id: courseId, subject: 'Not mine',
    });
    expect(error).toBeTruthy();
  });
});

describe('who can see a thread', () => {
  let mine;

  beforeAll(async () => {
    await become(alice.email);
    mine = await createSupportRequest({
      subject: 'Visibility check', body: 'Only some people should read this.', courseId,
    });
  });

  it('the trainer of the course it names cannot see admin support', async () => {
    await become(trainer.email);
    const ids = (await supportThreads()).map((t) => t.id);
    expect(ids).not.toContain(mine.id);
  });

  it('an admin can', async () => {
    await become(admin.email);
    expect((await supportThreads()).map((t) => t.id)).toContain(mine.id);
  });

  /** Not vacuous: the identical call returns the thread for the owning trainer. */
  it('a trainer of a different course cannot', async () => {
    await become(otherTrainer.email);
    expect((await supportThreads()).map((t) => t.id)).not.toContain(mine.id);
    // Refused outright, rather than the empty array a filtered read used to
    // return. Since the bodies moved behind the function this is an explicit
    // "no", which is a better answer than a result indistinguishable from an
    // empty conversation.
    await expect(supportMessages(mine.id)).rejects.toThrow(/No such request/);
  });

  /**
   * Supervisors oversee trainers and cannot resolve a trainee id to a name
   * anywhere else in the product. A support thread is the most personal thing
   * in it, so they are left out of can_see_support deliberately.
   */
  it('a supervisor cannot', async () => {
    await become(supervisor.email);
    expect((await supportThreads()).map((t) => t.id)).not.toContain(mine.id);
  });

  it('another trainee cannot', async () => {
    await become(bob.email);
    expect((await supportThreads()).map((t) => t.id)).not.toContain(mine.id);
    await expect(supportMessages(mine.id)).rejects.toThrow(/No such request/);
  });

  it('keeps course-linked support requests in the administrator inbox', async () => {
    await become(alice.email);
    const hygiene = await createSupportRequest({
      subject: 'Kitchen module', body: 'About Food Hygiene.', courseId: otherCourseId,
    });

    await become(otherTrainer.email);
    const theirs = (await supportThreads()).map((t) => t.id);
    expect(theirs).not.toContain(hygiene.id);
    expect(theirs).not.toContain(mine.id);

    await become(admin.email);
    const adminThreads = (await supportThreads()).map((t) => t.id);
    expect(adminThreads).toContain(mine.id);
    expect(adminThreads).toContain(hygiene.id);
  });

  it('a request naming no course reaches admins but not trainers', async () => {
    await become(alice.email);
    const general = await createSupportRequest({
      subject: 'General question', body: 'Nothing to do with a course.',
    });

    await become(trainer.email);
    expect((await supportThreads()).map((t) => t.id)).not.toContain(general.id);

    await become(admin.email);
    expect((await supportThreads()).map((t) => t.id)).toContain(general.id);
  });
});

describe('replying', () => {
  let thread;

  beforeAll(async () => {
    await become(alice.email);
    thread = await createSupportRequest({
      subject: 'Reply flow', body: 'First message.', courseId,
    });
  });

  it('lets the trainer answer, and flips who it is waiting on', async () => {
    await become(trainer.email);
    await replyToSupportRequest({ requestId: thread.id, body: 'Finish the quiz in module 1.' });

    const seen = (await supportThreads()).find((t) => t.id === thread.id);
    expect(seen.messageCount).toBe(2);
    expect(seen.hasReply).toBe(true);
    expect(seen.awaitingStaff).toBe(false);
  });

  it('flips back when the trainee writes again', async () => {
    await become(alice.email);
    await replyToSupportRequest({ requestId: thread.id, body: 'I already did that.' });
    const seen = (await supportThreads()).find((t) => t.id === thread.id);
    expect(seen.awaitingStaff).toBe(true);
  });

  /**
   * The defect this pins: a trainee cannot read their trainer's row in
   * `profiles` — no policy grants it, and none should, because that table
   * carries the email. The ordinary FK embed therefore returned null and every
   * staff reply was attributed to "Unknown", which makes a support thread close
   * to useless. public_profiles is the view that exists for this.
   *
   * The suite passed before the fix, because every earlier assertion was about
   * the author reading their own name.
   */
  it('names the trainer who replied, to the trainee reading it', async () => {
    await become(alice.email);
    const messages = await supportMessages(thread.id);
    const fromTrainer = messages.find((m) => m.authorId === trainer.id);

    expect(fromTrainer.authorName).toBe('Tara Trainer');
    expect(fromTrainer.authorRole).toBe('trainer');
  });

  /** And the other way: staff see who asked. */
  it('names the trainee who asked, to the trainer reading it', async () => {
    await become(trainer.email);
    const messages = await supportMessages(thread.id);
    expect(messages[0].authorName).toBe('Alice Ahmed');
    expect(messages[0].authorRole).toBe('trainee');
  });

  it('keeps the thread in the order it was written', async () => {
    const bodies = (await supportMessages(thread.id)).map((m) => m.body);
    expect(bodies).toEqual([
      'First message.',
      'Finish the quiz in module 1.',
      'I already did that.',
    ]);
  });

  /** Not vacuous: the same call succeeds for the trainer above. */
  it('refuses a reply from somebody who cannot see the thread', async () => {
    await become(bob.email);
    await expect(replyToSupportRequest({ requestId: thread.id, body: 'Sneaking in' }))
      .rejects.toThrow();
  });

  it('cannot be posted under another name', async () => {
    await become(bob.email);
    const { error } = await supabase.from('support_messages')
      .insert({ request_id: thread.id, author_id: alice.id, body: 'Forged' });
    expect(error).toBeTruthy();
  });
});

describe('closing a thread', () => {
  let thread;

  beforeAll(async () => {
    await become(alice.email);
    thread = await createSupportRequest({
      subject: 'Closing', body: 'Please close this after.', courseId,
    });
  });

  it('the author can close their own', async () => {
    await setSupportStatus({ requestId: thread.id, status: 'closed' });
    const seen = (await supportThreads()).find((t) => t.id === thread.id);
    expect(seen.status).toBe('closed');
  });

  /**
   * Enforced by the policy, not by the UI hiding the box. A reply landing on a
   * thread everybody has stopped watching is worse than being told no.
   */
  it('refuses a message on a closed thread', async () => {
    await expect(replyToSupportRequest({ requestId: thread.id, body: 'One more thing' }))
      .rejects.toThrow();
  });

  it('accepts one again once it is reopened', async () => {
    await setSupportStatus({ requestId: thread.id, status: 'open' });
    await replyToSupportRequest({ requestId: thread.id, body: 'One more thing' });
    expect((await supportMessages(thread.id)).at(-1).body).toBe('One more thing');
  });

  it('a trainee cannot close somebody else\'s', async () => {
    await become(bob.email);
    await setSupportStatus({ requestId: thread.id, status: 'closed' }).catch(() => null);
    const { data } = await svc.from('support_requests')
      .select('status').eq('id', thread.id).single();
    expect(data.status).toBe('open');
  });
});

describe('the record cannot be rewritten', () => {
  /**
   * No UPDATE or DELETE grant on support_messages at all. A thread that can be
   * edited after the fact is worth less than not having one.
   */
  it('refuses to edit or delete a message', async () => {
    await become(alice.email);
    const thread = await createSupportRequest({
      subject: 'Immutable', body: 'Original wording.', courseId,
    });
    const [message] = await supportMessages(thread.id);

    const { data: before } = await svc.from('support_messages')
      .select('body_cipher').eq('id', message.id).single();

    const { error: updErr } = await supabase.from('support_messages')
      .update({ body_cipher: 'Rewritten' }).eq('id', message.id);
    expect(updErr).toBeTruthy();

    await supabase.from('support_messages').delete().eq('id', message.id);

    // The stored ciphertext is byte-for-byte what it was, and still reads back
    // as the original words.
    const { data: after } = await svc.from('support_messages')
      .select('body_cipher').eq('id', message.id).single();
    expect(after.body_cipher).toBe(before.body_cipher);

    await become(alice.email);
    expect((await supportMessages(thread.id))[0].body).toBe('Original wording.');
  });
});

/**
 * The point of the encryption, checked against what is actually stored.
 *
 * Everything else in this file goes through the api, which decrypts — so none
 * of it would notice if the bodies were being written in the clear. These read
 * the raw rows with the service role, the way a leaked database dump would.
 */
describe('what is actually stored', () => {
  let thread;
  const SECRET = 'My password is hunter2 and I cannot open module 3.';

  beforeAll(async () => {
    await become(alice.email);
    thread = await createSupportRequest({
      subject: 'Encryption check', body: SECRET, courseId,
    });
  });

  it('holds no plaintext body', async () => {
    const { data } = await svc.from('support_messages')
      .select('body, body_cipher, body_iv').eq('request_id', thread.id);

    expect(data).toHaveLength(1);
    expect(data[0].body).toBeNull();
    expect(data[0].body_cipher).toBeTruthy();
    expect(data[0].body_iv).toBeTruthy();
    // The obvious mistake would be base64 of the plaintext rather than of a
    // ciphertext, which looks encrypted and is not.
    expect(Buffer.from(data[0].body_cipher, 'base64').toString('utf8'))
      .not.toContain('hunter2');
  });

  it('reads back as what was written', async () => {
    const [message] = await supportMessages(thread.id);
    expect(message.body).toBe(SECRET);
  });

  /**
   * A fresh IV per message. Reusing one with the same key is the single
   * mistake that breaks AES-GCM outright, and two identical messages are
   * exactly how it would show.
   */
  it('never reuses an initialisation vector', async () => {
    await replyToSupportRequest({ requestId: thread.id, body: 'Same text' });
    await replyToSupportRequest({ requestId: thread.id, body: 'Same text' });

    const { data } = await svc.from('support_messages')
      .select('body_cipher, body_iv').eq('request_id', thread.id);

    const ivs = data.map((m) => m.body_iv);
    expect(new Set(ivs).size).toBe(ivs.length);
    // Identical plaintext under different IVs must produce different bytes.
    const ciphers = data.map((m) => m.body_cipher);
    expect(new Set(ciphers).size).toBe(ciphers.length);
  });

  /** The data key is wrapped, so the database never holds it either. */
  it('stores the thread key only in wrapped form', async () => {
    const { data } = await svc.from('support_thread_keys')
      .select('wrapped_key, wrap_iv, key_version').eq('request_id', thread.id).single();
    expect(data.wrapped_key).toBeTruthy();
    expect(data.wrap_iv).toBeTruthy();
    expect(data.key_version).toBe(1);
  });

  /**
   * No grant at all on support_thread_keys, the same arrangement quiz_answer_keys
   * uses: "a browser can never read this" is a property of the grant table
   * rather than of every future query remembering to exclude a column.
   */
  it('lets no browser session near the thread keys', async () => {
    const { error } = await supabase.from('support_thread_keys').select('wrapped_key');
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/permission denied/i);
  });

  /** The function is the door, and it re-checks visibility itself. */
  it('refuses to decrypt for somebody who cannot see the thread', async () => {
    await become(bob.email);
    await expect(supportMessages(thread.id)).rejects.toThrow(/No such request/);
  });

  /**
   * 404, not 403. Telling somebody a thread exists but is not theirs confirms
   * that a given person filed a request about a given course.
   */
  it('does not confirm that a hidden thread exists', async () => {
    await become(otherTrainer.email);
    await expect(supportMessages(thread.id)).rejects.toThrow(/No such request/);
  });
});

describe('unread state', () => {
  let thread;

  beforeAll(async () => {
    await become(alice.email);
    thread = await createSupportRequest({
      subject: 'Unread check', body: 'First.', courseId,
    });
  });

  /** Your own messages are never unread to you. */
  it("does not count the reader's own messages", async () => {
    const seen = (await supportThreads()).find((t) => t.id === thread.id);
    expect(seen.unreadCount).toBe(0);
  });

  it('counts a reply the reader has not opened', async () => {
    await become(trainer.email);
    await replyToSupportRequest({ requestId: thread.id, body: 'Try this.' });

    await become(alice.email);
    const seen = (await supportThreads()).find((t) => t.id === thread.id);
    expect(seen.unreadCount).toBe(1);
  });

  it('clears once the thread is opened', async () => {
    await markSupportRead(thread.id);
    const seen = (await supportThreads()).find((t) => t.id === thread.id);
    expect(seen.unreadCount).toBe(0);
  });

  /** Per participant: one reader's state must not clear another's. */
  it('is tracked separately for each participant', async () => {
    await become(alice.email);
    await replyToSupportRequest({ requestId: thread.id, body: 'Did not work.' });

    await become(trainer.email);
    const forTrainer = (await supportThreads()).find((t) => t.id === thread.id);
    expect(forTrainer.unreadCount).toBeGreaterThan(0);

    await become(alice.email);
    const forAlice = (await supportThreads()).find((t) => t.id === thread.id);
    expect(forAlice.unreadCount).toBe(0);
  });
});
