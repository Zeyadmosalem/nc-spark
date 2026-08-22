import { supabase } from './client';

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

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

/** The caller's own enrollments, with derived progress joined in. */
export async function myEnrollments() {
  const rows = unwrap(await supabase
    .from('enrollments')
    .select('*, enrollment_progress(percent)'));
  return (rows ?? []).map((r) =>
    enrollmentToCamel({ ...r, percent: r.enrollment_progress?.[0]?.percent ?? 0 }));
}

/**
 * Applies for a course. status is deliberately absent: the column-limited
 * INSERT grant means it cannot be set from here at all, so the application
 * always lands as pending.
 */
export async function applyForCourse(courseId) {
  const { data: { user } } = await supabase.auth.getUser();
  const row = unwrap(await supabase.from('enrollments')
    .insert({ course_id: courseId, trainee_id: user.id })
    .select().single());
  return enrollmentToCamel(row);
}

/** Pending applications visible to the caller: their courses, or all for an admin. */
export async function pendingEnrollments() {
  const rows = unwrap(await supabase
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

async function invokeFn(fn, body) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export const decideEnrollment = (enrollmentId, decision) =>
  invokeFn('approve-enrollment', { enrollmentId, decision });
