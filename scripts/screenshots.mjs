// Regenerates the README screenshots.
//
//   npm run dev            # in another terminal
//   node scripts/screenshots.mjs docs/screenshots 5173
//
// Seeds a throwaway demo tenant, photographs it, and deletes everything again.
// Nothing persistent is touched: the review accounts and any real course are
// left alone, and every row this creates is removed in the finally block.
//
// The content is deliberately fictional and the admin dashboard and user
// directory are deliberately not shot — both list live email addresses, and
// this repository is public. Keep it that way if you add a screen here.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync('.env.test', 'utf8').split('\n')
  .filter((l) => l.trim() && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const svc = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const OUT = process.argv[2];
const PORT = process.argv[3];
const base = `http://localhost:${PORT}`;
const PW = 'Gallery-Demo-Passw0rd!';
const stamp = Date.now();
const SLUG = `demo-${stamp}`;

const must = (what, { data, error }) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

const person = async (role, name) => {
  const email = `demo-${stamp}-${name.split(' ')[0].toLowerCase()}@example.com`;
  const { data, error } = await svc.auth.admin.createUser({
    email, password: PW, email_confirm: true, user_metadata: { name } });
  if (error) throw error;
  await svc.from('profiles').update({ role, status: 'active' }).eq('id', data.user.id);
  return { id: data.user.id, email, name };
};

console.log('seeding...');
const admin = await person('admin', 'Dana Osei');
const trainer = await person('trainer', 'Priya Raman');
const alex = await person('trainee', 'Alex Mercer');
const jordan = await person('trainee', 'Jordan Wells');
const sam = await person('trainee', 'Sam Okafor');

const course = must('course', await svc.from('courses').insert({
  slug: SLUG,
  title: 'Warehouse Fire Safety',
  subtitle: 'Prevention, detection and evacuation',
  description: 'What to do before, during and after a fire in a distribution centre. Required annually for all floor staff.',
  status: 'published', color: '#00a3e0', icon: '🔥',
  trainer_id: trainer.id, created_by: admin.id,
}).select().single());

const second = must('course 2', await svc.from('courses').insert({
  slug: `${SLUG}-2`, title: 'Manual Handling',
  subtitle: 'Lifting without injuring yourself',
  description: 'Safe lifting technique, load assessment, and when to ask for help.',
  status: 'published', color: '#6b2c8d', icon: '🦺',
  trainer_id: trainer.id, created_by: admin.id,
}).select().single());

const modOne = must('module 1', await svc.from('modules')
  .insert({ course_id: course.id, title: 'Before a fire', position: 1 }).select().single());
const modTwo = must('module 2', await svc.from('modules')
  .insert({ course_id: course.id, title: 'During an evacuation', position: 2,
            unlock_after_module_id: null }).select().single());

const ACTS = [
  [modOne, 'reading', 'How fires start in a warehouse', {
    body: '# Three things a fire needs\n\nHeat, fuel and oxygen. Remove any one and the fire stops.\n\n- **Heat** — faulty chargers, hot work, cigarettes\n- **Fuel** — pallets, shrink wrap, cardboard\n- **Oxygen** — always present, so control the other two\n\nMost warehouse fires start at a charging bay outside working hours.',
    estimatedMinutes: 4 }, 10],
  [modOne, 'flashcards', 'Extinguisher types', {
    cards: [
      { front: 'Red label', back: 'Water — wood, paper, textiles. Never on electrical.' },
      { front: 'Blue label', back: 'Dry powder — most fires, but reduces visibility.' },
      { front: 'Black label', back: 'CO2 — electrical and flammable liquids.' },
    ] }, 10],
  [modOne, 'matching', 'Match the alarm to its meaning', {
    pairs: [
      { term: 'Continuous tone', definition: 'Evacuate the building now' },
      { term: 'Intermittent tone', definition: 'Stand by, prepare to leave' },
      { term: 'Voice message', definition: 'Follow the spoken instruction' },
    ] }, 10],
  [modTwo, 'reading', 'Your muster point', {
    body: '# Where to go\n\nThe east car park, beyond the loading bays.\n\nDo not stop for belongings. Do not use the goods lift. Report to your floor warden so they can account for you.',
    estimatedMinutes: 2 }, 10],
  [modTwo, 'scenario', 'You smell smoke', {
    description: 'Three decisions, in order.',
    steps: [
      { text: 'You smell smoke near the **charging bay**. Nobody else has noticed.',
        choices: [
          { id: 'a', text: 'Investigate the smell yourself first', isCorrect: false, feedback: 'Time spent investigating is time the alarm is not sounding.' },
          { id: 'b', text: 'Raise the alarm', isCorrect: true, feedback: 'Right. Alarm first, always — it costs nothing if you are wrong.' },
        ] },
      { text: 'The alarm is sounding and a colleague is still at their desk.',
        choices: [
          { id: 'c', text: 'Tell them and leave together', isCorrect: true, feedback: 'Correct. Leave together, by the nearest exit.' },
          { id: 'd', text: 'Assume they heard it', isCorrect: false, feedback: 'People do ignore alarms. Say it out loud.' },
        ] },
    ] }, 15],
];

const activities = [];
let pos = 0;
for (const [mod, type, title, content, xp] of ACTS) {
  pos += 1;
  activities.push(must('activity', await svc.from('activities').insert({
    module_id: mod.id, type, title, position: pos, content, xp,
  }).select().single()));
}

// Materials, so the tab is not an empty state.
await svc.from('course_materials').insert([
  { course_id: course.id, name: 'Evacuation floor plan', kind: 'link',
    external_url: 'https://example.com/floor-plan', created_by: trainer.id },
  { course_id: course.id, name: 'Fire warden checklist', kind: 'link',
    external_url: 'https://example.com/checklist', created_by: trainer.id },
]);

const enrol = async (who, courseId, status = 'active') => must('enrolment',
  await svc.from('enrollments').insert({ trainee_id: who.id, course_id: courseId, status })
    .select().single());

const alexEnrol = await enrol(alex, course.id);
await enrol(alex, second.id);
const jordanEnrol = await enrol(jordan, course.id);
await enrol(sam, course.id);
await svc.from('enrollments')
  .insert({ trainee_id: sam.id, course_id: second.id, status: 'pending' });

// Progress: Alex has done module one, Jordan one activity. XP and badges follow
// from the triggers, so the achievements screen has something real on it.
for (const a of activities.slice(0, 3)) {
  await svc.from('activity_completions').insert({ enrollment_id: alexEnrol.id, activity_id: a.id });
}
await svc.from('activity_completions')
  .insert({ enrollment_id: jordanEnrol.id, activity_id: activities[0].id });

await svc.from('messages').insert([
  { course_id: course.id, user_id: alex.id, body: 'Is the muster point still the east car park after the loading bay works?' },
  { course_id: course.id, user_id: trainer.id, body: 'Yes — east car park, past the barrier. The works only affect the vehicle route, not the walking one.' },
  { course_id: course.id, user_id: jordan.id, body: 'Thanks, that was going to be my question too.' },
]);

console.log('seeded. capturing...');

const browser = await chromium.launch({ channel: 'msedge' });
const errs = [];

const shoot = async (who, shots, { dark = false } = {}) => {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: dark ? 'dark' : 'light',
  });
  const page = await ctx.newPage();
  // ThemeProvider reads prefers-color-scheme only on a first visit and then
  // remembers a choice, so the media query alone is not reliable here. Setting
  // the stored preference before any script runs is.
  await page.addInitScript((mode) => {
    try { window.localStorage.setItem('nc_theme', mode); } catch { /* ignore */ }
  }, dark ? 'dark' : 'light');
  page.on('pageerror', (e) => errs.push(String(e)));

  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', who.email);
  await page.fill('input[type=password]', PW);
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1800);

  for (const [name, path] of shots) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  await ctx.close();
};

try {
  await shoot(alex, [
    ['trainee-dashboard', '/trainee'],
    ['trainee-course', `/trainee/courses/${course.id}`],
    ['trainee-achievements', '/trainee/achievements'],
    ['trainee-activity', `/trainee/activity/${activities[1].id}`],
  ]);
  await shoot(alex, [['trainee-dashboard-dark', '/trainee']], { dark: true });
  await shoot(trainer, [
    ['trainer-roster', `/trainer/courses/${course.id}/people`],
    ['trainer-chat', `/trainer/courses/${course.id}/chat`],
    ['course-builder', `/trainer/courses/${course.id}`],
  ]);
  // Only the curriculum screen. The admin dashboard and the user directory
  // both show real addresses from this project, and these images go into a
  // public README.
  await shoot(admin, [
    ['admin-curriculum', '/admin/content'],
  ]);
  console.log('captured. page errors:', errs.length ? errs.slice(0, 4) : 'none');
} finally {
  await browser.close();
  console.log('cleaning up...');
  await svc.from('courses').delete().like('slug', `${SLUG}%`);
  for (const p of [admin, trainer, alex, jordan, sam]) {
    await svc.auth.admin.deleteUser(p.id).catch(() => null);
  }
  console.log('demo tenant removed.');
}
