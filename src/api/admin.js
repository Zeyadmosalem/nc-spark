import { requireClient } from './client';
import { unwrap } from './helpers';
import { toCamel } from './profiles';

/**
 * Reads for the admin console.
 *
 * Every query here relies on an existing policy — profiles_select_admin,
 * enrollments_select_course_staff, quiz_attempts_select and
 * audit_log_select_admin. Nothing new was granted for this screen: a
 * non-admin calling these gets an empty set, not a leak.
 *
 * The three privileged *writes* are not here. They live in profiles.js and go
 * through Edge Functions, because approving a signup or changing a role has to
 * be validated and audited server-side.
 */

/** Exactly the columns profiles.toCamel reads. */
const PROFILE_COLUMNS = 'id, role, status, name, email, avatar, created_at';

const AUDIT_COLUMNS =
  'id, actor_id, actor_email, action, entity_type, entity_id, before, after, created_at';

/**
 * `unwrap` returns data; a head count has no data, only `count`. Same error
 * discipline, different field.
 */
async function countOf(table, apply) {
  const base = requireClient().from(table).select('id', { count: 'exact', head: true });
  const { count, error } = await (apply ? apply(base) : base);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Every user on the platform, newest first.
 *
 * Unfiltered on purpose: the directory has tabs and a search box, and an
 * installation of this size is hundreds of rows, not millions. One query the
 * page can slice beats six round trips that go stale against each other.
 */
export async function listUsers() {
  const rows = unwrap(await requireClient()
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .order('created_at', { ascending: false }));
  return (rows ?? []).map(toCamel);
}

/** The approval queue: oldest first, so nobody is buried under today's signups. */
export async function pendingSignups() {
  const rows = unwrap(await requireClient()
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('status', 'pending')
    .order('created_at', { ascending: true }));
  return (rows ?? []).map(toCamel);
}

/**
 * Headline counts. User counts are absent deliberately — listUsers already
 * returns every profile, and deriving the tallies from that one list keeps the
 * dashboard from disagreeing with the directory two clicks away.
 */
export async function platformStats() {
  const [
    coursesTotal, coursesPublished,
    enrollmentsActive, enrollmentsPending,
    attemptsTotal, attemptsPendingReview,
  ] = await Promise.all([
    countOf('courses'),
    countOf('courses',      (q) => q.eq('status', 'published')),
    countOf('enrollments',  (q) => q.eq('status', 'active')),
    countOf('enrollments',  (q) => q.eq('status', 'pending')),
    countOf('quiz_attempts'),
    countOf('quiz_attempts', (q) => q.eq('status', 'pending_review')),
  ]);

  return {
    courses:     { total: coursesTotal,     published: coursesPublished },
    enrollments: { active: enrollmentsActive, pending: enrollmentsPending },
    attempts:    { total: attemptsTotal,    pendingReview: attemptsPendingReview },
  };
}

/** The audit trail, newest first. Append-only at the database level. */
export async function recentAudit(limit = 25) {
  const rows = unwrap(await requireClient()
    .from('audit_log')
    .select(AUDIT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit));
  return (rows ?? []).map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorEmail: r.actor_email,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    before: r.before,
    after: r.after,
    createdAt: r.created_at,
  }));
}
