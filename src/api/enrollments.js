import { requireClient } from './client';
import { unwrap, invokeFn, currentUserId } from './helpers';

export function enrollmentToCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    traineeId: row.trainee_id,
    courseId: row.course_id,
    status: row.status,
    decidedAt: row.decided_at ?? null,
    completedAt: row.completed_at ?? null,
    percent: row.percent ?? 0,
  };
}

/** Exactly the columns enrollmentToCamel reads. */
const ENROLLMENT_COLUMNS = 'id, trainee_id, course_id, status, decided_at, completed_at';

/**
 * The caller's own enrollments, with derived progress attached.
 *
 * Two queries rather than `enrollments?select=*,enrollment_progress(percent)`.
 * That embed looks natural and never worked: enrollment_progress is a view
 * built on `left join lateral`, and PostgREST cannot trace its columns back to
 * a base-table relationship, so every call failed with "Could not find a
 * relationship between 'enrollments' and 'enrollment_progress' in the schema
 * cache". Because unwrap throws, My Courses rendered "Could not load your
 * courses" for everyone, and the mocked unit tests could not see it.
 *
 * Both reads are RLS-scoped on their own — the view is security_invoker — so
 * splitting them widens nothing.
 */
export async function myEnrollments() {
  const client = requireClient();
  const [rows, progress] = await Promise.all([
    client.from('enrollments').select(ENROLLMENT_COLUMNS).then(unwrap),
    client.from('enrollment_progress').select('enrollment_id, percent').then(unwrap),
  ]);
  const percentOf = new Map((progress ?? []).map((p) => [p.enrollment_id, p.percent]));
  return (rows ?? []).map((r) =>
    enrollmentToCamel({ ...r, percent: percentOf.get(r.id) ?? 0 }));
}

/**
 * Applies for a course. status is deliberately absent: the column-limited
 * INSERT grant means it cannot be set from here at all, so the application
 * always lands as pending.
 */
export async function applyForCourse(courseId) {
  const row = unwrap(await requireClient().from('enrollments')
    .insert({ course_id: courseId, trainee_id: await currentUserId() })
    .select().single());
  return enrollmentToCamel(row);
}

/** Pending applications visible to the caller: their courses, or all for an admin. */
export async function pendingEnrollments() {
  const rows = unwrap(await requireClient()
    .from('enrollments')
    .select('*, profiles!enrollments_trainee_id_fkey(name, avatar), courses(title)')
    .eq('status', 'pending'));
  return (rows ?? []).map((r) => ({
    ...enrollmentToCamel(r),
    traineeName: r.profiles?.name ?? 'Unknown',
    traineeAvatar: r.profiles?.avatar ?? '?',
    courseTitle: r.courses?.title ?? '',
  }));
}

export const decideEnrollment = (enrollmentId, decision) =>
  invokeFn('approve-enrollment', { enrollmentId, decision });

/**
 * Enrolments on the caller's own courses, with the trainee named.
 *
 * enrollments_select_course_staff scopes this to courses the caller trains
 * (or all of them for an admin), and profiles_select_my_trainees is what makes
 * the name readable — a trainer may see the people on their courses.
 *
 * Deliberately not supervisor.js's teamEnrollments, which is the same read
 * with the identity left out. A supervisor oversees trainers and cannot
 * resolve a trainee id to a name at all; a trainer teaches these people. Two
 * postures, two functions, rather than one function that quietly returns more
 * to whoever happens to have the privilege.
 */
export async function courseEnrollments() {
  const client = requireClient();
  const [rows, progress] = await Promise.all([
    client
      .from('enrollments')
      .select(`
        id, trainee_id, course_id, status, completed_at,
        profiles!enrollments_trainee_id_fkey(id, name, avatar)
      `)
      .then(unwrap),
    client.from('enrollment_progress').select('enrollment_id, percent').then(unwrap),
  ]);

  const percentOf = new Map((progress ?? []).map((p) => [p.enrollment_id, p.percent]));
  return (rows ?? []).map((r) => ({
    id: r.id,
    traineeId: r.trainee_id,
    traineeName: r.profiles?.name ?? 'Unknown',
    traineeAvatar: r.profiles?.avatar ?? '?',
    courseId: r.course_id,
    status: r.status,
    completedAt: r.completed_at ?? null,
    percent: percentOf.get(r.id) ?? 0,
  }));
}
