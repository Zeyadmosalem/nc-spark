// Seeds the prototype's three quizzes into the database.
//
// This script is the ONLY place the answers live. They used to sit in
// src/data/dummyData.js, which meant every correct answer and every
// explanation shipped in the production bundle for anyone to read — the
// finding that opened this milestone. Scripts are never bundled, and the keys
// land in quiz_answer_keys, a table no browser role can read.
//
// Usage: npm run db:seed-quizzes
//
// Idempotent: re-running replaces a quiz's questions rather than duplicating
// them, so it is safe to run again after editing content.

import { serviceClient } from '../supabase/tests/helpers.js';
import { QUIZZES, COURSES } from '../src/data/dummyData.js';

const svc = serviceClient();

// seed-catalog derives a course slug from its title, so that is the only
// stable link between a dummy course id and the real row. Matching on the
// dummy id would find nothing: real courses carry uuids.
const slugFor = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const slugForDummyCourse = (dummyCourseId) => {
  const course = COURSES.find((c) => c.id === dummyCourseId);
  return course ? slugFor(course.title) : null;
};

// Keyed by the dummy-data question id, extracted from dummyData before the
// answers were stripped out of it.
const ANSWERS = {
  q1: [
    { id: 'q1_1', type: 'mcq', correct: 2,
      explanation: 'A do...while loop checks its condition AFTER the first execution, ensuring the body runs at least once.' },
    { id: 'q1_2', type: 'truefalse', correct: false,
      explanation: 'for...of works on iterables (arrays, strings, Maps, Sets). Plain objects are not iterable by default.' },
    { id: 'q1_3', type: 'mcq', correct: 1,
      explanation: 'break immediately terminates the loop and continues with the code after it.' },
    { id: 'q1_4', type: 'truefalse', correct: true,
      explanation: 'continue skips the remaining code in the current iteration and proceeds to the next one.' },
    { id: 'q1_5', type: 'mcq', correct: 2,
      explanation: 'Array.map() transforms each element and returns a new array of the same length.' },
    { id: 'q1_6', type: 'paragraph',
      guidance: 'Write at least 3 sentences. Your trainer will review this response.' },
  ],
  q2: [
    { id: 'q2_1', type: 'mcq', correct: 2,
      explanation: "Nielsen's 10 Usability Heuristics are the most widely used guidelines in UX design." },
    { id: 'q2_2', type: 'truefalse', correct: false,
      explanation: 'Hi-fi prototypes can be built in design tools like Figma or Adobe XD without any code.' },
    { id: 'q2_3', type: 'paragraph',
      guidance: 'Think of an app, website, or physical product. Be specific.' },
  ],
  q3: [
    { id: 'q3_1', type: 'mcq', correct: 2,
      explanation: 'Arrays have O(1) random access because elements are stored contiguously in memory.' },
    { id: 'q3_2', type: 'truefalse', correct: false,
      explanation: 'Singly linked lists only traverse forward. You need a doubly linked list for bidirectional traversal.' },
  ],
};

const keyFor = (a) => {
  if (a.type === 'mcq') return { index: a.correct };
  if (a.type === 'truefalse') return { value: a.correct };
  return { guidance: a.guidance ?? 'Your trainer reviews this response.' };
};

async function seedQuiz(dummyId, quiz) {
  const answers = ANSWERS[dummyId];
  if (!answers) throw new Error(`no answer payload for ${dummyId}`);

  // The prototype attached a quiz to a course rather than to an activity, so
  // these seed as course finals. A trainer can move one onto a module
  // activity later.
  const slug = slugForDummyCourse(quiz.courseId);
  const { data: course } = slug
    ? await svc.from('courses').select('id, title').eq('slug', slug).maybeSingle()
    : { data: null };
  if (!course) {
    console.log(`  SKIP ${dummyId}: no course with slug ${slug ?? '(unknown)'} — run npm run db:seed-catalog first`);
    return;
  }

  const { data: existing } = await svc.from('quizzes')
    .select('id').eq('course_id', course.id).is('activity_id', null).maybeSingle();

  let quizId = existing?.id;
  if (quizId) {
    await svc.from('quiz_questions').delete().eq('quiz_id', quizId);
    await svc.from('quizzes').update({
      title: quiz.title, pass_mark: quiz.passMark, time_limit_seconds: quiz.timeLimit,
    }).eq('id', quizId);
  } else {
    const { data, error } = await svc.from('quizzes').insert({
      course_id: course.id, activity_id: null, title: quiz.title,
      pass_mark: quiz.passMark, time_limit_seconds: quiz.timeLimit,
    }).select('id').single();
    if (error) throw new Error(error.message);
    quizId = data.id;
  }

  for (const [i, q] of quiz.questions.entries()) {
    const answer = answers.find((a) => a.id === q.id);
    if (!answer) throw new Error(`no answer for question ${q.id}`);

    const { data: row, error } = await svc.from('quiz_questions').insert({
      quiz_id: quizId, type: q.type, position: i + 1, prompt: q.prompt,
      options: q.options ?? [], points: q.type === 'paragraph' ? 2 : 1,
    }).select('id').single();
    if (error) throw new Error(error.message);

    const { error: keyErr } = await svc.from('quiz_answer_keys').insert({
      question_id: row.id, answer: keyFor(answer), explanation: answer.explanation ?? null,
    });
    if (keyErr) throw new Error(keyErr.message);
  }

  console.log(`  seeded ${dummyId} -> ${course.title}: ${quiz.questions.length} questions`);
}

console.log('Seeding quizzes…');
for (const [dummyId, quiz] of Object.entries(QUIZZES)) {
  await seedQuiz(dummyId, quiz);
}
console.log('Done. Answer keys live in quiz_answer_keys, readable only by service_role.');
