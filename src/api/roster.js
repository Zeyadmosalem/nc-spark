import { requireClient } from './client';
import { unwrap } from './helpers';

/**
 * Who is on a course, and where each of them has got to.
 *
 * A trainer could see an average and a headcount and nothing else — so the one
 * question compliance training exists to answer, "who has not done it yet",
 * had no screen. The prototype had a page for this built on invented trainees;
 * every policy it needs has been in place since M3.
 *
 * Three reads rather than one embed. enrollment_progress is a view built on
 * `left join lateral` and PostgREST cannot relate it to a base table — the
 * defect that left My Courses broken in production for a milestone — and
 * activity_completions has no foreign key to profiles to embed through
 * either. Joining in JavaScript is the honest version of this.
 *
 * Everything here is authorised by policy, not by this function: for a trainer
 * enrollments_select_course_staff, profiles_select_my_trainees,
 * activity_completions_select and quiz_attempts_select all scope to courses
 * they train. An admin matches all four too. Nobody else gets a row.
 */

const ROSTER_COLUMNS = `
  id, trainee_id, course_id, status, created_at, completed_at,
  profiles!enrollments_trainee_id_fkey(id, name, avatar)
`;

const num = (v) => (v === null || v === undefined ? null : Number(v));

export async function courseRoster(courseId) {
  const client = requireClient();

  const enrollments = unwrap(await client
    .from('enrollments').select(ROSTER_COLUMNS).eq('course_id', courseId));

  const ids = (enrollments ?? []).map((e) => e.id);

  // Nobody is enrolled. Two `in ()` queries on an empty list is two round
  // trips to be told the same thing.
  if (ids.length === 0) return [];

  const [progress, completions, attempts] = await Promise.all([
    client.from('enrollment_progress')
      .select('enrollment_id, percent').in('enrollment_id', ids).then(unwrap),
    client.from('activity_completions')
      .select('enrollment_id, activity_id, completed_at').in('enrollment_id', ids).then(unwrap),
    client.from('quiz_attempts')
      .select(`
        id, trainee_id, quiz_id, attempt_no, status, submitted_at,
        auto_score, final_score, passed, quizzes!inner(id, title, course_id)
      `)
      .eq('quizzes.course_id', courseId)
      .not('submitted_at', 'is', null)
      .then(unwrap),
  ]);

  const percentOf = new Map((progress ?? []).map((p) => [p.enrollment_id, p.percent]));

  const doneBy = new Map();
  for (const c of completions ?? []) {
    if (!doneBy.has(c.enrollment_id)) doneBy.set(c.enrollment_id, new Map());
    doneBy.get(c.enrollment_id).set(c.activity_id, c.completed_at);
  }

  const attemptsBy = new Map();
  for (const a of attempts ?? []) {
    if (!attemptsBy.has(a.trainee_id)) attemptsBy.set(a.trainee_id, []);
    attemptsBy.get(a.trainee_id).push({
      id: a.id,
      quizId: a.quiz_id,
      quizTitle: a.quizzes?.title ?? 'Untitled quiz',
      attemptNo: a.attempt_no,
      status: a.status,
      submittedAt: a.submitted_at,
      // Neither is coerced to zero: "waiting on marking" and "scored nothing"
      // are different things to put in front of a trainer.
      score: num(a.final_score) ?? num(a.auto_score),
      passed: a.passed,
    });
  }

  return (enrollments ?? []).map((e) => ({
    id: e.id,
    traineeId: e.trainee_id,
    name: e.profiles?.name || 'Unnamed',
    avatar: e.profiles?.avatar ?? null,
    status: e.status,
    enrolledAt: e.created_at,
    completedAt: e.completed_at ?? null,
    percent: percentOf.get(e.id) ?? 0,
    completedActivities: doneBy.get(e.id) ?? new Map(),
    attempts: (attemptsBy.get(e.trainee_id) ?? [])
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)),
  }));
}
