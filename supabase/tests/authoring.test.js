// Authoring, through the real api layer, against the live project.
//
// The whole point of this file is the last test in the first block: create a
// course, add an activity, and publish it. That loop has never closed. The
// database has allowed it since M2 — modules_write and activities_write are
// `for all` policies covering an admin or the owning trainer — and no code
// ever called them, so publish-course refused every course the app could make.
//
// It also pins activities_content_shape. That CHECK constraint keys off the
// activity type, and EMPTY_CONTENT in src/api/authoring.js is a hand-written
// mirror of it. A mocked test cannot tell whether the two still agree.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { serviceClient, createUser, uniqueEmail, SUPABASE_URL } from './helpers.js';

const localPath = new URL('../../.env.test.local', import.meta.url);
const hostedPath = new URL('../../.env.test', import.meta.url);
const env = Object.fromEntries(
  readFileSync(existsSync(localPath) ? localPath : hostedPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }));

process.env.VITE_SUPABASE_URL = env.SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;

const { supabase } = await import('../../src/api/client.js');
const {
  getCourseForEditing, createModule, updateModule, deleteModule,
  createActivity, updateActivity, deleteActivity,
  AUTHORABLE_TYPES, EMPTY_CONTENT,
} = await import('../../src/api/authoring.js');
const { createCourse, publishCourse } = await import('../../src/api/courses.js');

const svc = serviceClient();
const PASSWORD = 'Test-Passw0rd!';
const PREFIX = `auth${Date.now()}`;

let admin, trainee;
let courseId, moduleId;
const madeUsers = [];

async function become(email) {
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);
}

async function mk(role) {
  const u = await createUser({ email: uniqueEmail(), role });
  madeUsers.push(u.id);
  return u;
}

beforeAll(async () => {
  admin = await mk('admin');
  trainee = await mk('trainee');
}, 60000);

afterAll(async () => {
  await supabase.auth.signOut();
  if (courseId) await svc.from('courses').delete().eq('id', courseId);
  await svc.from('courses').delete().like('slug', `${PREFIX}%`);
  for (const id of madeUsers) {
    await svc.auth.admin.deleteUser(id).catch(() => null);
  }
});

describe('an admin building a course', () => {
  beforeAll(() => become(admin.email));

  it('creates a course through the api the console uses', async () => {
    const course = await createCourse({
      title: `${PREFIX} Fire Safety`, subtitle: 'Basics',
      description: 'x', color: '#dc3545', icon: 'F',
    });
    courseId = course.id;
    expect(course.status).toBe('draft');
  });

  /**
   * The reason a new course could not be published. publish-course counts
   * activities and refuses at zero, and nothing in the app could add one.
   */
  it('cannot publish it while it is empty', async () => {
    await expect(publishCourse(courseId, true))
      .rejects.toThrow(/at least one activity/);
  });

  it('adds a module', async () => {
    const created = await createModule({ courseId, title: 'Module one', position: 1 });
    moduleId = created.id;
    expect(created.position).toBe(1);
    expect(created.unlockAfterModuleId).toBeNull();
  });

  /**
   * activities_content_shape is a CHECK constraint keyed on the type, and
   * EMPTY_CONTENT is a hand-written mirror of it. If the two drift, this is
   * where it shows: the insert is rejected outright.
   */
  it.each(AUTHORABLE_TYPES)('accepts a %s with the default content shape', async (type) => {
    const position = AUTHORABLE_TYPES.indexOf(type) + 1;
    const created = await createActivity({
      moduleId, type, title: `A ${type}`, position,
    });
    expect(created.type).toBe(type);
    expect(created.content).toEqual(EMPTY_CONTENT[type]);
  });

  /**
   * The three structured types, with content a trainer would actually author.
   * jsonb round-tripping is the risk the default-shape test above cannot see:
   * the defaults are one blank row, so a nested array of objects — the thing
   * scenario stores — is never exercised by it.
   */
  it('stores authored flashcards, pairs and scenario steps unchanged', async () => {
    const authored = {
      flashcards: { cards: [
        { front: 'What does PPE stand for?', back: 'Personal Protective Equipment' },
        { front: 'Class A fire', back: 'Ordinary combustibles' },
      ] },
      matching: { pairs: [
        { term: 'Class A', definition: 'Wood and paper' },
        { term: 'Class B', definition: 'Flammable liquids' },
      ] },
      scenario: { steps: [{
        text: 'The fire door is propped open with a chair.',
        choices: [
          { text: 'Close it and report it', isCorrect: true, feedback: 'Right — it is a fire route.' },
          { text: 'Leave it, someone needed it open', isCorrect: false, feedback: 'A propped fire door is a breach.' },
        ],
      }] },
    };

    let position = 20;
    for (const [type, content] of Object.entries(authored)) {
      position += 1;
      const created = await createActivity({
        moduleId, type, title: `Authored ${type}`, position, content,
      });
      // toEqual, not a spot check on one key: isCorrect is a boolean inside a
      // nested array, and the scenario renderer branches on it.
      expect(created.content).toEqual(content);

      const back = await getCourseForEditing(courseId);
      const stored = back.modules[0].activities.find((a) => a.id === created.id);
      expect(stored.content).toEqual(content);
    }
  });

  it('rejects content of the wrong shape, rather than storing it', async () => {
    await expect(createActivity({
      moduleId, type: 'reading', title: 'Broken', position: 90, content: { videoId: 'x' },
    })).rejects.toThrow(/activities_content_shape|violates check constraint/i);
  });

  // unique (module_id, position)
  it('refuses to reuse a position', async () => {
    await expect(createActivity({
      moduleId, type: 'reading', title: 'Clash', position: 1,
    })).rejects.toThrow(/duplicate key|unique/i);
  });

  it('reads the whole thing back, in order', async () => {
    const course = await getCourseForEditing(courseId);
    expect(course.modules).toHaveLength(1);
    const positions = course.modules[0].activities.map((a) => a.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    // The seven defaults, plus the three authored ones above.
    expect(course.modules[0].activities).toHaveLength(AUTHORABLE_TYPES.length + 3);
  });

  it('edits an activity', async () => {
    const course = await getCourseForEditing(courseId);
    const reading = course.modules[0].activities.find((a) => a.type === 'reading');
    const updated = await updateActivity(reading.id, {
      title: 'Renamed', xp: 0, content: { body: 'the real text' },
    });
    expect(updated.title).toBe('Renamed');
    expect(updated.xp).toBe(0);
    expect(updated.content).toEqual({ body: 'the real text' });
  });

  /**
   * This is the loop closing. Everything above exists so that this line stops
   * throwing.
   */
  it('publishes the course now that it has content', async () => {
    const result = await publishCourse(courseId, true);
    expect(result.ok).toBe(true);
    const { data } = await svc.from('courses').select('status').eq('id', courseId).single();
    expect(data.status).toBe('published');
  });

  it('gates a second module behind the first', async () => {
    const second = await createModule({ courseId, title: 'Module two', position: 2 });
    const gated = await updateModule(second.id, { unlockAfterModuleId: moduleId });
    expect(gated.unlockAfterModuleId).toBe(moduleId);

    const cleared = await updateModule(second.id, { unlockAfterModuleId: null });
    expect(cleared.unlockAfterModuleId).toBeNull();

    await deleteModule(second.id);
    const course = await getCourseForEditing(courseId);
    expect(course.modules.map((m) => m.id)).not.toContain(second.id);
  });

  it('deletes an activity', async () => {
    const before = await getCourseForEditing(courseId);
    const victim = before.modules[0].activities.at(-1);
    await deleteActivity(victim.id);
    const after = await getCourseForEditing(courseId);
    expect(after.modules[0].activities.map((a) => a.id)).not.toContain(victim.id);
  });

  /**
   * Status is excluded from the column-level UPDATE grant so publishing has to
   * go through publish-course, which checks for content first. A direct write
   * must not be a way around that.
   */
  it('cannot set the status by writing to the table', async () => {
    const { error } = await supabase.from('courses')
      .update({ status: 'published' }).eq('id', courseId);
    expect(error).toBeTruthy();
  });
});

describe('a trainee', () => {
  beforeAll(() => become(trainee.email));

  // Not vacuous: every one of these succeeded for the admin above.
  it('cannot add a module to somebody else course', async () => {
    await expect(createModule({ courseId, title: 'Mine now', position: 99 }))
      .rejects.toThrow();
  });

  it('cannot add an activity', async () => {
    await expect(createActivity({
      moduleId, type: 'reading', title: 'Mine', position: 99,
    })).rejects.toThrow();
  });

  it('cannot delete a module', async () => {
    await deleteModule(moduleId).catch(() => null);
    const { data } = await svc.from('modules').select('id').eq('id', moduleId);
    expect(data).toHaveLength(1);
  });

  /**
   * getCourseForEditing carries activity content, and scenario content holds
   * isCorrect (backlog B3). A trainee reaching it for a course they are not
   * enrolled in would be a leak; the published course is readable, so this
   * pins that the CONTENT is what stays out of a non-enrolled trainee's reach.
   */
  it('cannot read the module content of a course they are not enrolled in', async () => {
    const course = await getCourseForEditing(courseId);
    const activities = (course?.modules ?? []).flatMap((m) => m.activities);
    expect(activities).toEqual([]);
  });

  it('is refused by publish-course', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/publish-course`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ courseId, publish: false }),
    });
    expect(res.status).toBe(403);
  });
});
