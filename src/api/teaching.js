import { requireClient } from './client';
import { unwrap, invokeFn, currentUserId } from './helpers';

/**
 * Who teaches what.
 *
 * courses.trainer_id is not grantable from the browser — the catalog migration
 * excludes it from the UPDATE grant on purpose, so reassignment cannot happen
 * through a table write. A trainer asks for a course, an admin decides, and
 * approve-teaching-request sets trainer_id with the service role.
 *
 * That makes this queue the ONLY way a course gets a trainer. A course sitting
 * here undecided is a course nobody can manage.
 */

export async function pendingTeachingRequests() {
  const rows = unwrap(await requireClient()
    .from('teaching_requests')
    .select(`
      id, status, created_at,
      profiles!teaching_requests_trainer_id_fkey(id, name, avatar, email),
      courses(id, title, status)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true }));

  return (rows ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    createdAt: r.created_at,
    trainerId: r.profiles?.id,
    trainerName: r.profiles?.name ?? 'Unknown',
    trainerAvatar: r.profiles?.avatar ?? '?',
    trainerEmail: r.profiles?.email ?? '',
    courseId: r.courses?.id,
    courseTitle: r.courses?.title ?? '',
  }));
}

export const decideTeachingRequest = (requestId, decision) =>
  invokeFn('approve-teaching-request', { requestId, decision });

/**
 * A trainer's own requests, whatever their state.
 *
 * teaching_requests_select matches own rows or an admin, so this is already
 * scoped; trainer_id is named anyway so an admin calling it gets their own
 * requests rather than everyone's.
 */
export async function myTeachingRequests() {
  const rows = unwrap(await requireClient()
    .from('teaching_requests')
    .select('id, course_id, status, created_at')
    .eq('trainer_id', await currentUserId())
    .order('created_at', { ascending: false }));
  return (rows ?? []).map((r) => ({
    id: r.id, courseId: r.course_id, status: r.status, createdAt: r.created_at,
  }));
}

/**
 * Asks to teach a course. The INSERT grant covers only (trainer_id, course_id)
 * and teaching_requests_insert_self requires the row to be the caller's own
 * and their role to be trainer, so status cannot be set from here — it always
 * lands as pending, waiting on an admin.
 *
 * `teaching_requests_one_open` is a partial unique index over pending rows, so
 * asking twice is a duplicate-key error rather than two entries in the queue.
 */
export async function requestToTeach(courseId) {
  const row = unwrap(await requireClient()
    .from('teaching_requests')
    .insert({ trainer_id: await currentUserId(), course_id: courseId })
    .select('id, course_id, status, created_at').single());
  return {
    id: row.id, courseId: row.course_id, status: row.status, createdAt: row.created_at,
  };
}
