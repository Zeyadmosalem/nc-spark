import { requireClient } from './client';
import { unwrap, invokeFn } from './helpers';

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
