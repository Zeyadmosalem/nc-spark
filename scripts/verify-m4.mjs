// Live end-to-end check of M4 assessment integrity.
//
// Creates its own users, course and quizzes, walks the whole assessment loop
// against the configured project, and removes what it made.
//
// It also greps the BUILT BUNDLE. The audit that started this milestone found
// the leak by reading dist/, not by reading source — so that is where the
// check belongs. Run `npm run build` first, or this section is skipped loudly.
//
// Usage: npm run verify:m4

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  serviceClient, anonClient, createUser, signIn, uniqueEmail, SUPABASE_URL,
} from '../supabase/tests/helpers.js';

const svc = serviceClient();
const PREFIX = `m4v${Date.now()}`;

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

async function fn(name, client, body) {
  const { data: { session } } = await client.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Every key anywhere in a payload, however deeply nested. */
function allKeys(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, found));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { found.add(k); allKeys(v, found); }
  }
  return found;
}

const created = [];

try {
  // ---------------------------------------------------------------- bundle --
  console.log('\n1. the built bundle carries no answers');
  const assets = join('dist', 'assets');
  if (!existsSync(assets)) {
    check('dist/ exists (run npm run build first)', false, 'SKIPPED the bundle checks');
  } else {
    const js = readdirSync(assets).filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');

    const leaks = [
      'A do...while loop checks its condition AFTER',
      "Nielsen's 10 Usability Heuristics",
      'Arrays have O(1) random access',
      'break immediately terminates the loop',
      'continue skips the remaining code',
    ];
    const found = leaks.filter((s) => js.includes(s));
    check('no seeded explanation text', found.length === 0, found.join(' | '));
    check('no quiz answer key literals', !js.includes('quiz_answer_keys'));
  }

  // ------------------------------------------------------------------ setup --
  const trainer = await createUser({ email: uniqueEmail(), role: 'trainer', name: 'Trainer' });
  const trainee = await createUser({ email: uniqueEmail(), role: 'trainee', name: 'Amira' });
  created.push(trainer.id, trainee.id);

  const { data: course } = await svc.from('courses').insert({
    slug: `${PREFIX}-1`, title: 'M4 Verification', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();

  const { data: mod } = await svc.from('modules')
    .insert({ course_id: course.id, title: 'Module A', position: 1 }).select().single();
  const { data: quizAct } = await svc.from('activities').insert({
    module_id: mod.id, type: 'quiz', title: 'Module Quiz', position: 1, content: {},
  }).select().single();

  async function makeQuiz({ activityId, questions, title }) {
    const { data: quiz } = await svc.from('quizzes').insert({
      course_id: course.id, activity_id: activityId, title, pass_mark: 0.7,
    }).select().single();
    const ids = [];
    for (const [i, q] of questions.entries()) {
      const { data: row } = await svc.from('quiz_questions').insert({
        quiz_id: quiz.id, type: q.type, position: i + 1, prompt: q.prompt,
        options: q.options ?? [], points: q.points ?? 1,
      }).select().single();
      ids.push(row.id);
      if (q.answer) {
        await svc.from('quiz_answer_keys').insert({
          question_id: row.id, answer: q.answer,
          explanation: 'SECRET-EXPLANATION-SHOULD-NEVER-REACH-A-BROWSER',
        });
      }
    }
    return { quizId: quiz.id, questionIds: ids };
  }

  const moduleQuiz = await makeQuiz({
    activityId: quizAct.id, title: 'Module Quiz',
    questions: [
      { type: 'mcq', prompt: 'Pick the third', options: ['a', 'b', 'c'], answer: { index: 2 } },
      { type: 'truefalse', prompt: 'True?', answer: { value: true } },
    ],
  });

  const { data: enrollment } = await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: course.id, status: 'active' }).select().single();

  const c = await signIn(trainee.email);
  const cTrainer = await signIn(trainer.email);

  // ------------------------------------------------------------ the key ----
  console.log('\n2. the answer key is unreachable from a browser');
  const asTrainee = await c.from('quiz_answer_keys').select('answer');
  check('a signed-in trainee is refused', asTrainee.error !== null,
    asTrainee.error?.message ?? `LEAKED ${asTrainee.data?.length} rows`);
  const asAnon = await anonClient().from('quiz_answer_keys').select('answer');
  check('an anonymous visitor is refused', asAnon.error !== null,
    asAnon.error?.message ?? 'LEAKED');
  const embedded = await c.from('quiz_questions').select('id, quiz_answer_keys(answer)');
  check('an embedded read is refused', embedded.error !== null,
    embedded.error?.message ?? 'LEAKED');

  // ----------------------------------------------------------- start/submit --
  console.log('\n3. starting a quiz reveals nothing');
  const started = await fn('start-quiz', c, { quizId: moduleQuiz.quizId });
  check('attempt opens', started.status === 200, `got ${started.status}`);
  const startKeys = [...allKeys(started.body)];
  check('no answer key in the payload',
    !startKeys.includes('answer') && !startKeys.includes('explanation'));
  check('no explanation text in the payload',
    !JSON.stringify(started.body).includes('SECRET-EXPLANATION'));

  console.log('\n4. a wrong answer fails and completes nothing');
  const failed = await fn('submit-quiz', c, {
    attemptId: started.body.attempt.id,
    answers: [
      { questionId: moduleQuiz.questionIds[0], response: { index: 0 } },
      { questionId: moduleQuiz.questionIds[1], response: { value: false } },
    ],
  });
  check('graded as failed', failed.body?.passed === false, `score ${failed.body?.score}%`);
  check('result reveals no answers',
    !JSON.stringify(failed.body).includes('SECRET-EXPLANATION'));
  const { count: afterFail } = await svc.from('activity_completions')
    .select('id', { count: 'exact', head: true }).eq('enrollment_id', enrollment.id);
  check('no completion recorded, so the module stays locked', afterFail === 0,
    `${afterFail} completions`);

  console.log('\n5. a second attempt needs a trainer');
  const refused = await fn('start-quiz', c, { quizId: moduleQuiz.quizId });
  check('refused with 409', refused.status === 409, `got ${refused.status}`);
  const selfGrant = await fn('grant-retake', c, {
    quizId: moduleQuiz.quizId, traineeId: trainee.id,
  });
  check('a trainee cannot grant themselves one', selfGrant.status === 403,
    `got ${selfGrant.status}`);
  const granted = await fn('grant-retake', cTrainer, {
    quizId: moduleQuiz.quizId, traineeId: trainee.id, reason: 'Verification run',
  });
  check('the trainer can', granted.status === 200, `got ${granted.status}`);

  console.log('\n6. passing the retake unlocks the module');
  const second = await fn('start-quiz', c, { quizId: moduleQuiz.quizId });
  check('attempt 2 opens', second.body?.attempt?.attemptNo === 2,
    `attemptNo ${second.body?.attempt?.attemptNo}`);
  const passed = await fn('submit-quiz', c, {
    attemptId: second.body.attempt.id,
    answers: [
      { questionId: moduleQuiz.questionIds[0], response: { index: 2 } },
      { questionId: moduleQuiz.questionIds[1], response: { value: true } },
    ],
  });
  check('graded as passed', passed.body?.passed === true, `score ${passed.body?.score}%`);
  const { count: afterPass } = await svc.from('activity_completions')
    .select('id', { count: 'exact', head: true }).eq('enrollment_id', enrollment.id);
  check('the completion is recorded', afterPass === 1, `${afterPass} completions`);

  console.log('\n7. a paragraph waits for a trainer');
  const { data: mod2 } = await svc.from('modules')
    .insert({ course_id: course.id, title: 'Module B', position: 2 }).select().single();
  const { data: act2 } = await svc.from('activities').insert({
    module_id: mod2.id, type: 'quiz', title: 'Written', position: 1, content: {},
  }).select().single();
  const written = await makeQuiz({
    activityId: act2.id, title: 'Written',
    questions: [
      { type: 'truefalse', prompt: 'True?', answer: { value: true } },
      { type: 'paragraph', prompt: 'Explain.', points: 2 },
    ],
  });

  const w1 = await fn('start-quiz', c, { quizId: written.quizId });
  const wSub = await fn('submit-quiz', c, {
    attemptId: w1.body.attempt.id,
    answers: [
      { questionId: written.questionIds[0], response: { value: true } },
      { questionId: written.questionIds[1], response: { text: 'Because it repeats.' } },
    ],
  });
  check('held at pending_review', wSub.body?.status === 'pending_review', wSub.body?.status);
  check('no verdict yet', wSub.body?.passed === null);
  const { count: beforeGrade } = await svc.from('activity_completions')
    .select('id', { count: 'exact', head: true })
    .eq('enrollment_id', enrollment.id).eq('activity_id', act2.id);
  check('nothing completed while it waits', beforeGrade === 0);

  const graded = await fn('grade-paragraph', cTrainer, {
    attemptId: w1.body.attempt.id, questionId: written.questionIds[1],
    awarded: 2, comment: 'Good.',
  });
  check('the trainer grades it', graded.status === 200, `got ${graded.status}`);
  check('now passed', graded.body?.passed === true, `score ${graded.body?.score}%`);
  const { count: afterGrade } = await svc.from('activity_completions')
    .select('id', { count: 'exact', head: true })
    .eq('enrollment_id', enrollment.id).eq('activity_id', act2.id);
  check('and the activity completes', afterGrade === 1);

  console.log('\n8. the course final gates completion');
  const final = await makeQuiz({
    activityId: null, title: 'Final',
    questions: [{ type: 'truefalse', prompt: 'Ready?', answer: { value: true } }],
  });
  const { data: beforeFinal } = await svc.from('enrollments')
    .select('status').eq('id', enrollment.id).single();
  check('100% of activities does NOT complete the course', beforeFinal.status === 'active',
    beforeFinal.status);

  const f1 = await fn('start-quiz', c, { quizId: final.quizId });
  check('the final is reachable', f1.status === 200, `got ${f1.status}`);
  await fn('submit-quiz', c, {
    attemptId: f1.body.attempt.id,
    answers: [{ questionId: final.questionIds[0], response: { value: true } }],
  });
  const { data: afterFinal } = await svc.from('enrollments')
    .select('status, completed_at').eq('id', enrollment.id).single();
  check('passing the final does', afterFinal.status === 'completed', afterFinal.status);
  check('completed_at is set', afterFinal.completed_at !== null);

  console.log('\n9. results cannot be forged');
  const forgeAttempt = await c.from('quiz_attempts')
    .insert({ quiz_id: final.quizId, trainee_id: trainee.id, enrollment_id: enrollment.id, attempt_no: 9 });
  check('a trainee cannot insert an attempt', forgeAttempt.error !== null,
    forgeAttempt.error?.message ?? 'ALLOWED');
  await c.from('quiz_attempts').update({ passed: true, final_score: 100 })
    .eq('quiz_id', moduleQuiz.quizId);
  const { data: untouched } = await svc.from('quiz_attempts')
    .select('passed').eq('quiz_id', moduleQuiz.quizId).eq('attempt_no', 1).single();
  check('a trainee cannot mark an attempt passed', untouched.passed === false,
    `passed=${untouched.passed}`);
} finally {
  await svc.from('quiz_retake_grants').delete().eq('reason', 'Verification run');
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  for (const id of created) await svc.auth.admin.deleteUser(id);
  console.log('\ncleaned up');
}

console.log(failures === 0
  ? '\nM4 verified: assessment is graded on the server and the key never leaves it.'
  : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
