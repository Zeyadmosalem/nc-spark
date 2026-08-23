// Course materials, through the real api layer, against the live project.
//
// This one crosses two systems: a row in course_materials and an object in the
// private `course-materials` bucket, each with its own policies. Mocked tests
// cannot see either — and the two most likely failures are exactly there: a
// storage policy that reads the course id out of the object path, and a CHECK
// constraint that permits a stored file or an external link but never both.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { serviceClient, createUser, uniqueEmail } from './helpers.js';

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
  listCourseMaterials, addMaterialFile, addMaterialLink, removeMaterial, materialUrl,
} = await import('../../src/api/materials.js');

const svc = serviceClient();
const PASSWORD = 'Test-Passw0rd!';
const PREFIX = `mat${Date.now()}`;

let trainer, enrolled, outsider, courseId;
let uploaded, linked;
const madeUsers = [];

const must = ({ error }, what) => {
  if (error) throw new Error(`fixture: could not ${what} - ${error.message}`);
};

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

/** A stand-in handout. The bytes never matter; the path and policies do. */
const handout = (name = 'handbook.pdf') =>
  new File([new Uint8Array([37, 80, 68, 70])], name, { type: 'application/pdf' });

beforeAll(async () => {
  trainer  = await mk('trainer');
  enrolled = await mk('trainee');
  outsider = await mk('trainee');

  const { data: c, error } = await svc.from('courses').insert({
    slug: `${PREFIX}-course`, title: 'Materials Course', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();
  must({ error }, 'create the course');
  courseId = c.id;

  must(await svc.from('enrollments')
    .insert({ trainee_id: enrolled.id, course_id: courseId, status: 'active' }),
  'enrol the trainee');
}, 90000);

afterAll(async () => {
  await supabase.auth.signOut();
  for (const m of [uploaded, linked]) {
    if (m?.storagePath) {
      await svc.storage.from('course-materials').remove([m.storagePath]).catch(() => null);
    }
  }
  await svc.from('courses').delete().eq('id', courseId);
  for (const id of madeUsers) {
    await svc.auth.admin.deleteUser(id).catch(() => null);
  }
});

describe('the owning trainer', () => {
  beforeAll(() => become(trainer.email));

  it('uploads a file and records it', async () => {
    uploaded = await addMaterialFile({
      courseId, file: handout(), name: 'Fire Handbook',
    });
    expect(uploaded.kind).toBe('pdf');
    expect(uploaded.name).toBe('Fire Handbook');
    // The storage policy reads the course id out of the first path segment.
    expect(uploaded.storagePath.startsWith(`${courseId}/`)).toBe(true);
    expect(uploaded.externalUrl).toBeNull();
  });

  it('adds an external link', async () => {
    linked = await addMaterialLink({
      courseId, name: 'Regulations', url: 'https://gov.example/reg',
    });
    expect(linked.kind).toBe('link');
    expect(linked.storagePath).toBeNull();
  });

  /**
   * course_materials_has_target is an exclusive or:
   * (storage_path is not null) <> (external_url is not null). Neither, or
   * both, has to be rejected by the database rather than only by the form.
   */
  it('cannot store a material that is both a file and a link', async () => {
    const { error } = await svc.from('course_materials').insert({
      course_id: courseId, name: 'Both', kind: 'pdf',
      storage_path: `${courseId}/x.pdf`, external_url: 'https://x',
    });
    expect(error?.message ?? '').toMatch(/course_materials_has_target|check constraint/i);
  });

  it('cannot store a material that is neither', async () => {
    const { error } = await svc.from('course_materials').insert({
      course_id: courseId, name: 'Neither', kind: 'pdf',
    });
    expect(error).toBeTruthy();
  });

  it('lists both, oldest first', async () => {
    const list = await listCourseMaterials(courseId);
    expect(list.map((m) => m.name)).toEqual(['Fire Handbook', 'Regulations']);
  });

  // The bucket is private: without a signed URL the object is unreachable.
  it('can mint a signed URL for the stored file', async () => {
    const url = await materialUrl(uploaded);
    expect(url).toMatch(/token=/);
    const res = await fetch(url);
    expect(res.status).toBe(200);
  });

  it('returns an external link untouched', async () => {
    expect(await materialUrl(linked)).toBe('https://gov.example/reg');
  });
});

describe('an enrolled trainee', () => {
  beforeAll(() => become(enrolled.email));

  it('sees the materials', async () => {
    const list = await listCourseMaterials(courseId);
    expect(list.map((m) => m.name).sort()).toEqual(['Fire Handbook', 'Regulations']);
  });

  it('can download the file', async () => {
    const [file] = (await listCourseMaterials(courseId)).filter((m) => m.storagePath);
    const res = await fetch(await materialUrl(file));
    expect(res.status).toBe(200);
  });

  // course_materials_write is admin or owning trainer only.
  it('cannot add one', async () => {
    await expect(addMaterialLink({ courseId, name: 'Mine', url: 'https://x' }))
      .rejects.toThrow();
  });

  it('cannot remove one', async () => {
    await removeMaterial({ id: uploaded.id, storagePath: null }).catch(() => null);
    const { data } = await svc.from('course_materials').select('id').eq('id', uploaded.id);
    expect(data).toHaveLength(1);
  });
});

describe('a trainee who is not enrolled', () => {
  beforeAll(() => become(outsider.email));

  // Not vacuous: the enrolled trainee gets two rows from the same call.
  it('sees no materials at all', async () => {
    expect(await listCourseMaterials(courseId)).toEqual([]);
  });

  /**
   * The storage policy authorises on the course id in the object path, so it
   * has to refuse independently of the table. A leaked path must not be
   * enough to reach the file.
   */
  it('cannot sign a URL for a file whose path it knows', async () => {
    await expect(materialUrl(uploaded)).rejects.toThrow();
  });
});

describe('removing', () => {
  beforeAll(() => become(trainer.email));

  it('takes the row and the object away together', async () => {
    const doomed = await addMaterialFile({ courseId, file: handout('temp.pdf') });
    await removeMaterial({ id: doomed.id, storagePath: doomed.storagePath });

    const { data } = await svc.from('course_materials').select('id').eq('id', doomed.id);
    expect(data).toHaveLength(0);

    const { data: listed } = await svc.storage.from('course-materials').list(courseId);
    expect((listed ?? []).map((o) => `${courseId}/${o.name}`))
      .not.toContain(doomed.storagePath);
  });
});
