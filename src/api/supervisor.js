import { requireClient } from './client';
import { unwrap } from './helpers';

/**
 * Oversight for a supervisor: their trainers, those trainers' courses, and how
 * the cohorts on them are doing.
 *
 * **Aggregates, not individuals.** A supervisor manages trainers, not
 * trainees, and profiles_select_supervised matches only the trainers linked to
 * them — a trainee's name is not readable here and this deliberately does not
 * ask for one. Every figure below is a count or an average over a cohort. That
 * is a privacy posture, not a limitation to be worked around: if an individual
 * trainee ever needs naming on this screen, it should be a decision with a
 * policy change behind it, not a join that quietly started returning names.
 *
 * Every read leans on a policy that already exists — supervisor_trainers'
 * own-row policy, profiles_select_supervised, courses_select_supervisor,
 * enrollments_select_supervisor and quiz_attempts_select. The last two of
 * those return exactly the managed trainers' rows, so these queries do not
 * filter by trainer themselves; RLS is the filter.
 */

/** The trainers this supervisor is responsible for. */
export async function myTrainers() {
  const rows = unwrap(await requireClient()
    .from('supervisor_trainers')
    .select('trainer_id, profiles!supervisor_trainers_trainer_id_fkey(id, name, avatar, email, status)'));
  return (rows ?? [])
    .map((r) => r.profiles)
    .filter(Boolean)
    .map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar, email: p.email, status: p.status,
    }))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}

/**
 * Courses run by the managed trainers.
 *
 * courses_select_supervisor also lets published courses through for everyone,
 * so this filters to the trainers actually managed rather than returning the
 * whole catalog. The ids come from myTrainers, i.e. from the caller's own
 * code, so the filter is explicit rather than incidental.
 */
export async function teamCourses(trainerIds = []) {
  if (trainerIds.length === 0) return [];
  const rows = unwrap(await requireClient()
    .from('courses')
    .select('id, title, subtitle, status, icon, color, trainer_id')
    .in('trainer_id', trainerIds)
    .order('title'));
  return (rows ?? []).map((r) => ({
    id: r.id, title: r.title, subtitle: r.subtitle, status: r.status,
    icon: r.icon, color: r.color, trainerId: r.trainer_id,
  }));
}

/**
 * Enrolments across the team, with progress, and no trainee identity.
 *
 * enrollments_select_supervisor already scopes this to courses run by managed
 * trainers. trainee_id is not selected: it is an id the supervisor cannot
 * resolve to a name anyway, and not fetching it keeps that true by
 * construction rather than by the caller remembering not to use it.
 */
export async function teamEnrollments() {
  const client = requireClient();
  const [rows, progress] = await Promise.all([
    client.from('enrollments').select('id, course_id, status').then(unwrap),
    client.from('enrollment_progress').select('enrollment_id, percent').then(unwrap),
  ]);
  const percentOf = new Map((progress ?? []).map((p) => [p.enrollment_id, p.percent]));
  return (rows ?? []).map((r) => ({
    id: r.id,
    courseId: r.course_id,
    status: r.status,
    percent: percentOf.get(r.id) ?? 0,
  }));
}

/**
 * Finished quiz attempts across the team.
 *
 * The quizzes embed is what backlog B5 was about: quiz_attempts_select has
 * matched supervisors since M4, quizzes_select did not, so this used to come
 * back as "attempt on <unknown quiz>". Fixed in 20260825000100.
 */
export async function teamQuizAttempts() {
  const rows = unwrap(await requireClient()
    .from('quiz_attempts')
    .select(`
      id, quiz_id, status, passed, auto_score, final_score, submitted_at,
      quizzes(id, title, course_id, pass_mark)
    `)
    .not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: false }));

  return (rows ?? []).map((r) => ({
    id: r.id,
    quizId: r.quiz_id,
    quizTitle: r.quizzes?.title ?? 'Unknown quiz',
    courseId: r.quizzes?.course_id ?? null,
    status: r.status,
    passed: r.passed,
    score: r.final_score === null || r.final_score === undefined
      ? (r.auto_score === null || r.auto_score === undefined ? null : Number(r.auto_score))
      : Number(r.final_score),
    submittedAt: r.submitted_at,
  }));
}
