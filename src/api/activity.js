import { requireClient } from './client';
import { unwrap } from './helpers';

/**
 * Usage tracking: who is here, and when they were last here.
 *
 * The write is a single RPC that takes no arguments — it records the CALLER,
 * from auth.uid() inside a definer function — so nothing in the browser can
 * invent activity for another account or backdate its own.
 */

/** Records that the signed-in user is here today. Never throws. */
export async function touchActivity() {
  try {
    await requireClient().rpc('touch_activity');
  } catch {
    // Usage tracking must never be the reason somebody cannot use the app.
    // A missed visit is a gap in a report; a thrown error here would be a
    // blank screen on sign-in.
  }
}

const summaryToCamel = (row) => ({
  userId: row.user_id,
  name: row.name,
  email: row.email,
  role: row.role,
  status: row.status,
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
  daysActive30: row.days_active_30,
  visits30: row.visits_30,
  visitsTotal: row.visits_total,
});

/**
 * Every account with its usage, for the administrator's people screen.
 *
 * The view is security_invoker, so this returns everybody to an admin and a
 * single row — their own — to anybody else. The screen that calls it is behind
 * an admin route, but that is not what makes it safe.
 */
export async function usageSummary() {
  const rows = unwrap(await requireClient()
    .from('user_activity_summary')
    .select('user_id, name, email, role, status, created_at, last_seen_at, days_active_30, visits_30, visits_total')
    .order('last_seen_at', { ascending: false, nullsFirst: false }));

  return (rows ?? []).map(summaryToCamel);
}

/**
 * How many distinct people used the platform on each of the last `days` days.
 *
 * Counting PEOPLE rather than visits: one person refreshing forty times is not
 * forty people, and a usage chart that cannot tell those apart flatters itself.
 */
export async function dailyActiveUsers(days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = unwrap(await requireClient()
    .from('user_activity')
    .select('user_id, day')
    .gte('day', since));

  const byDay = new Map();
  for (const row of rows ?? []) {
    if (!byDay.has(row.day)) byDay.set(row.day, new Set());
    byDay.get(row.day).add(row.user_id);
  }

  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push({ date: d, points: byDay.get(d)?.size ?? 0 });
  }
  return out;
}

/** "3 days ago", or "Never" — a date alone makes the reader do the sum. */
export function sinceLabel(iso) {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 60) return 'Over a month ago';
  return `Over ${Math.floor(days / 30)} months ago`;
}
