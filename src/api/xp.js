import { requireClient } from './client';
import { unwrap, currentUserId } from './helpers';

/**
 * XP, read from the ledger the triggers write.
 *
 * Nothing here can award anything: xp_events and trainee_stats have no insert
 * or update grant for a browser role at all, so every function in this file is
 * a read. That is deliberate — see 20260829000200_xp.sql.
 */

const EVENT_COLUMNS = 'id, trainee_id, course_id, kind, points, created_at';

export const KIND_LABEL = {
  activity: 'Activity',
  quiz: 'Quiz',
  participation: 'Taking part',
};

export function eventToCamel(row) {
  return {
    id: row.id,
    traineeId: row.trainee_id,
    courseId: row.course_id,
    kind: row.kind,
    points: row.points,
    createdAt: row.created_at,
  };
}

/**
 * A level is 100 XP wide.
 *
 * Deliberately arithmetic rather than a table of thresholds: a table is a
 * second thing to keep in step with the awards, and nothing about the product
 * needs the curve to bend yet.
 */
export const LEVEL_SIZE = 100;

export function levelOf(xp) {
  const total = Math.max(0, xp ?? 0);
  const level = Math.floor(total / LEVEL_SIZE) + 1;
  const into = total % LEVEL_SIZE;
  return {
    level,
    into,
    toNext: LEVEL_SIZE - into,
    percent: Math.round((into / LEVEL_SIZE) * 100),
  };
}

/** The signed-in trainee's own total, streak and last active day. */
export async function myStats() {
  const id = await currentUserId();
  const row = unwrap(await requireClient()
    .from('trainee_stats')
    .select('xp, streak, last_active_on')
    .eq('profile_id', id)
    .maybeSingle());

  return {
    xp: row?.xp ?? 0,
    streak: row?.streak ?? 0,
    lastActiveOn: row?.last_active_on ?? null,
  };
}

/**
 * The signed-in trainee's awards, newest first.
 *
 * Bounded: the ledger grows for the life of the account, and a page that reads
 * all of it gets slower every week it is used.
 */
export async function myXpEvents(limit = 50) {
  const id = await currentUserId();
  const rows = unwrap(await requireClient()
    .from('xp_events')
    .select(EVENT_COLUMNS)
    .eq('trainee_id', id)
    .order('created_at', { ascending: false })
    .limit(limit));

  return (rows ?? []).map(eventToCamel);
}

const dayKey = (iso) => new Date(iso).toISOString().slice(0, 10);

/**
 * Points per day for the last `days` days, oldest first, with the empty days
 * present.
 *
 * The gaps matter: a chart drawn only from the days that have events shows a
 * smooth line through a fortnight of doing nothing, which is the opposite of
 * what a streak chart is for.
 */
export function pointsByDay(events, days = 30) {
  const today = new Date();
  const buckets = new Map();

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }

  for (const event of events) {
    const key = dayKey(event.createdAt);
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + event.points);
  }

  return [...buckets].map(([date, points]) => ({ date, points }));
}

/** How the total splits by where it came from. */
export function pointsByKind(events) {
  const totals = { activity: 0, quiz: 0, participation: 0 };
  for (const event of events) {
    if (totals[event.kind] !== undefined) totals[event.kind] += event.points;
  }
  return Object.entries(totals)
    .map(([kind, points]) => ({ kind, label: KIND_LABEL[kind], points }))
    .filter((slice) => slice.points > 0);
}

/**
 * The standing of everybody on one course.
 *
 * Readable by the course's trainer, a supervisor of that trainer, and an
 * admin — xp_events_select_staff decides that, not this query. A trainee
 * calling it sees only their own row, which is why the trainee screens do not
 * use it.
 */
export async function courseStandings(courseId) {
  if (!courseId) return [];

  const rows = unwrap(await requireClient()
    .from('xp_events')
    .select('trainee_id, points, kind, created_at')
    .eq('course_id', courseId));

  const byTrainee = new Map();
  for (const row of rows ?? []) {
    const current = byTrainee.get(row.trainee_id) ?? { xp: 0, awards: 0 };
    current.xp += row.points;
    current.awards += 1;
    byTrainee.set(row.trainee_id, current);
  }

  if (byTrainee.size === 0) return [];

  // Names come from public_profiles: a trainer may read a trainee's display
  // identity, and must not need `profiles`, which carries the email.
  const names = unwrap(await requireClient()
    .from('public_profiles')
    .select('id, name, avatar')
    .in('id', [...byTrainee.keys()]));

  const nameOf = new Map((names ?? []).map((p) => [p.id, p]));

  return [...byTrainee]
    .map(([traineeId, totals]) => ({
      traineeId,
      name: nameOf.get(traineeId)?.name || 'Deactivated account',
      avatar: nameOf.get(traineeId)?.avatar ?? null,
      xp: totals.xp,
      awards: totals.awards,
    }))
    .sort((a, b) => b.xp - a.xp);
}
