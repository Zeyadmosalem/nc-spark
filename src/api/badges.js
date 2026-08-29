import { requireClient } from './client';
import { unwrap, currentUserId } from './helpers';

/**
 * Badges and the course leaderboard.
 *
 * Both are reads. Badges are awarded by app.evaluate_badges from the XP
 * ledger, and the leaderboard is a view — there is nothing here a browser
 * could call to change a standing.
 */

/** Every badge that exists, earned or not. */
export async function badgeCatalog() {
  const rows = unwrap(await requireClient()
    .from('badges')
    .select('code, name, description, icon, sort_order')
    .order('sort_order'));

  return (rows ?? []).map((b) => ({
    code: b.code,
    name: b.name,
    description: b.description,
    icon: b.icon,
  }));
}

/** Which of them the signed-in trainee has, and when they got each. */
export async function myBadges() {
  const id = await currentUserId();
  const rows = unwrap(await requireClient()
    .from('trainee_badges')
    .select('badge_code, earned_at')
    .eq('trainee_id', id));

  return new Map((rows ?? []).map((r) => [r.badge_code, r.earned_at]));
}

/**
 * The standing on one course.
 *
 * Reads course_leaderboard, which is a definer view that decides for itself
 * who may see what: you must be on the course, teach it, oversee it, or be an
 * admin. Somebody outside gets an empty list rather than an error, because
 * "there is no such leaderboard for you" and "this course has nobody on it"
 * are the same answer as far as an outsider should be able to tell.
 */
export async function courseLeaderboard(courseId) {
  if (!courseId) return [];

  const rows = unwrap(await requireClient()
    .from('course_leaderboard')
    .select('trainee_id, name, avatar, xp, position')
    .eq('course_id', courseId)
    .order('position'));

  return (rows ?? []).map((r) => ({
    traineeId: r.trainee_id,
    name: r.name || 'Deactivated account',
    avatar: r.avatar,
    xp: r.xp,
    position: r.position,
  }));
}
