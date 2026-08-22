import { supabase } from './client';
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
  const row = unwrap(await supabase.from('enrollments')
    .insert({ course_id: courseId, trainee_id: await currentUserId() })
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

export const decideEnrollment = (enrollmentId, decision) =>
  invokeFn('approve-enrollment', { enrollmentId, decision });
