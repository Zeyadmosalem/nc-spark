// Live end-to-end check of the M3 learning loop against the configured
// Supabase project. Creates its own users, course and files, then removes them.
//
// Usage: npm run verify:m3

import { serviceClient, createUser, signIn, uniqueEmail, SUPABASE_URL }
  from '../supabase/tests/helpers.js';

const svc = serviceClient();
const PREFIX = `m3v${Date.now()}`;

async function call(client, body) {
  const { data: { session } } = await client.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/complete-activity`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const created = [];
const uploaded = [];
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

try {
  const trainer = await createUser({ email: uniqueEmail(), role: 'trainer', name: 'Trainer' });
  const trainee = await createUser({ email: uniqueEmail(), role: 'trainee', name: 'Amira' });
  const other   = await createUser({ email: uniqueEmail(), role: 'trainee', name: 'Sam' });
  created.push(trainer.id, trainee.id, other.id);

  const { data: course } = await svc.from('courses').insert({
    slug: `${PREFIX}-1`, title: 'M3 Verification', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();

  const { data: modA } = await svc.from('modules')
    .insert({ course_id: course.id, title: 'Module A', position: 1 }).select().single();
  const { data: modB } = await svc.from('modules')
    .insert({ course_id: course.id, title: 'Module B', position: 2, unlock_after_module_id: modA.id })
    .select().single();

  const mkAct = async (moduleId, position, type, content) => {
    const { data } = await svc.from('activities')
      .insert({ module_id: moduleId, type, title: `${type} ${position}`, position, content })
      .select().single();
    return data.id;
  };
  const a1 = await mkAct(modA.id, 1, 'reading', { body: '## Rules' });
  const a2 = await mkAct(modA.id, 2, 'flashcards', { cards: [{ front: 'Q', back: 'A' }] });
  const b1 = await mkAct(modB.id, 1, 'video', { videoId: 'abc' });

  const { data: enrollment } = await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: course.id, status: 'active' })
    .select().single();

  const c = await signIn(trainee.email);
  const cOther = await signIn(other.email);

  console.log('\n1. module B is locked before A is finished');
  const locked = await call(c, { activityId: b1 });
  check('refused with 423', locked.status === 423, `got ${locked.status} ${locked.body?.error ?? ''}`);

  console.log('\n2. complete both activities in module A');
  const p1 = (await call(c, { activityId: a1 })).body?.progress?.percent;
  const p2 = (await call(c, { activityId: a2 })).body?.progress?.percent;
  check('progress rises', p1 === 33 && p2 === 67, `${p1}% then ${p2}%`);

  console.log('\n3. module B is now reachable');
  const open = await call(c, { activityId: b1 });
  check('accepted with 200', open.status === 200, `got ${open.status}`);
  check('progress reaches 100', open.body?.progress?.percent === 100,
    `${open.body?.progress?.percent}%`);

  console.log('\n4. the enrollment is marked completed');
  const { data: e } = await svc.from('enrollments')
    .select('status, completed_at').eq('id', enrollment.id).single();
  check('status is completed', e.status === 'completed', e.status);
  check('completed_at is set', e.completed_at !== null);

  console.log('\n5. completions cannot be forged from the browser');
  // The REAL enrollment id: a bogus one would fail on the foreign key and
  // prove nothing about the missing INSERT grant.
  const ins = await c.from('activity_completions')
    .insert({ enrollment_id: enrollment.id, activity_id: a1 });
  check('direct insert blocked', ins.error !== null, ins.error?.message ?? 'NO ERROR');
  await c.from('activity_completions').delete().eq('enrollment_id', enrollment.id);
  const { count } = await svc.from('activity_completions')
    .select('id', { count: 'exact', head: true }).eq('enrollment_id', enrollment.id);
  check('direct delete blocked', count === 3, `${count} completions remain`);

  console.log('\n6. submissions land under the trainee prefix and stay private');
  const file = new Blob(['my work'], { type: 'text/plain' });
  const mine = `${course.id}/${trainee.id}/${PREFIX}-work.txt`;
  const up = await c.storage.from('submissions').upload(mine, file, { upsert: true });
  uploaded.push(mine);
  check('trainee uploads their own work', up.error === null, up.error?.message);

  const forged = `${course.id}/${other.id}/${PREFIX}-forged.txt`;
  const bad = await c.storage.from('submissions').upload(forged, file, { upsert: true });
  check('cannot write under another trainee', bad.error !== null, bad.error?.message ?? 'ALLOWED');

  const peek = await cOther.storage.from('submissions').download(mine);
  check('another trainee cannot read it', peek.error !== null, peek.error?.message ?? 'ALLOWED');

  const cTrainer = await signIn(trainer.email);
  const byTrainer = await cTrainer.storage.from('submissions').download(mine);
  check('the course trainer can read it', byTrainer.error === null, byTrainer.error?.message);

  console.log('\n7. course materials are trainer-write, enrolled-read');
  const mat = `${course.id}/${PREFIX}-manual.txt`;
  const matUp = await cTrainer.storage.from('course-materials').upload(mat, file, { upsert: true });
  uploaded.push(mat);
  check('trainer uploads a material', matUp.error === null, matUp.error?.message);
  const matRead = await c.storage.from('course-materials').download(mat);
  check('enrolled trainee reads it', matRead.error === null, matRead.error?.message);
  const matDenied = await cOther.storage.from('course-materials').download(mat);
  check('unenrolled trainee cannot', matDenied.error !== null, matDenied.error?.message ?? 'ALLOWED');
} finally {
  if (uploaded.length) {
    await svc.storage.from('submissions').remove(uploaded);
    await svc.storage.from('course-materials').remove(uploaded);
  }
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  for (const id of created) await svc.auth.admin.deleteUser(id);
  console.log('\ncleaned up');
}

console.log(failures === 0
  ? '\nM3 verified: the learning loop works end to end.'
  : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
