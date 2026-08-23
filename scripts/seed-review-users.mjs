// Creates one account per role for reviewing the deployed site, and puts the
// trainee somewhere worth looking at: enrolled on a published course with a
// quiz waiting.
//
// These accounts use REVIEW_DOMAIN, which resetDb deliberately spares, so a
// database test run does not delete the logins someone is using.
//
// Usage: npm run db:seed-review

import { randomBytes } from 'node:crypto';
import { serviceClient, createUser, REVIEW_DOMAIN } from '../supabase/tests/helpers.js';

const svc = serviceClient();

// Never hardcoded. A literal here was committed to a PUBLIC repository while
// the site was live, which handed admin to anyone who read it — the password,
// the account names and the URL were all public at once.
//
// Supply REVIEW_PASSWORD to choose one, otherwise a fresh one is generated and
// printed once. Either way nothing lands in git.
const PASSWORD = process.env.REVIEW_PASSWORD
  ?? `Rv-${randomBytes(12).toString('base64url')}`;

const PEOPLE = [
  { key: 'admin',      role: 'admin',      name: 'Review Admin' },
  { key: 'trainer',    role: 'trainer',    name: 'Review Trainer' },
  { key: 'supervisor', role: 'supervisor', name: 'Review Supervisor' },
  { key: 'trainee',    role: 'trainee',    name: 'Review Trainee' },
];

const emailFor = (key) => `${key}@${REVIEW_DOMAIN}`;

async function findByEmail(email) {
  const { data } = await svc.auth.admin.listUsers({ perPage: 1000 });
  return (data?.users ?? []).find((u) => u.email === email) ?? null;
}

console.log('Seeding review accounts…\n');
const made = {};

for (const person of PEOPLE) {
  const email = emailFor(person.key);
  const existing = await findByEmail(email);

  if (existing) {
    // Re-running must not fail, and must reset the password to the known one
    // in case somebody changed it while poking around.
    await svc.auth.admin.updateUserById(existing.id, { password: PASSWORD });
    await svc.from('profiles')
      .update({ role: person.role, status: 'active', name: person.name })
      .eq('id', existing.id);
    made[person.key] = existing.id;
    console.log(`  refreshed  ${email.padEnd(34)} ${person.role}`);
  } else {
    const user = await createUser({
      email, password: PASSWORD, role: person.role, status: 'active', name: person.name,
    });
    made[person.key] = user.id;
    console.log(`  created    ${email.padEnd(34)} ${person.role}`);
  }
}

// Give the trainer something to own and the trainee something to do.
const { data: courses } = await svc.from('courses')
  .select('id, title, status').order('title');

if (!courses?.length) {
  console.log('\n  No courses found — run `npm run db:seed-catalog` first.');
} else {
  const published = courses.filter((c) => c.status === 'published');

  for (const course of published) {
    await svc.from('courses').update({ trainer_id: made.trainer }).eq('id', course.id);

    const { data: already } = await svc.from('enrollments')
      .select('id').eq('trainee_id', made.trainee).eq('course_id', course.id).maybeSingle();
    if (!already) {
      await svc.from('enrollments')
        .insert({ trainee_id: made.trainee, course_id: course.id, status: 'active' });
    }
  }

  // The supervisor needs to manage the trainer to see anything at all.
  const { data: link } = await svc.from('supervisor_trainers')
    .select('supervisor_id').eq('supervisor_id', made.supervisor)
    .eq('trainer_id', made.trainer).maybeSingle();
  if (!link) {
    await svc.from('supervisor_trainers')
      .insert({ supervisor_id: made.supervisor, trainer_id: made.trainer });
  }

  console.log(`\n  trainer owns ${published.length} published course(s)`);
  console.log(`  trainee enrolled on ${published.length}`);
  console.log('  supervisor manages the trainer');
}

console.log('\n─────────────────────────────────────────────');
console.log(' Sign in with any of these:\n');
for (const p of PEOPLE) console.log(`   ${p.role.padEnd(11)} ${emailFor(p.key)}`);
console.log(`\n   password    ${PASSWORD}`);
console.log('─────────────────────────────────────────────');
console.log('\nPrinted once and stored nowhere. Put it in a password manager,');
console.log('not in a file in this repository.');
console.log('\nThese accounts survive `npm run test:db`. Everything else does not.');
