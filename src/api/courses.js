import { requireClient } from './client';
import { unwrap, invokeFn } from './helpers';

/** The single place course rows become camelCase. */
export function courseToCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    trainerId: row.trainer_id,
    color: row.color,
    icon: row.icon,
    status: row.status,
    createdAt: row.created_at,
  };
}

/**
 * Exactly the columns courseToCamel reads.
 *
 * select('*') would ship every column a future migration adds — internal
 * notes, review comments, cost fields — to every signed-in browser, silently.
 * Listing them means a new column has to be opted in.
 */
const COURSE_COLUMNS =
  'id, slug, title, subtitle, description, trainer_id, color, icon, status, created_at';

export async function listCourses() {
  const rows = unwrap(await requireClient().from('courses').select(COURSE_COLUMNS).order('title'));
  return (rows ?? []).map(courseToCamel);
}

/** Course with its modules and their activities, ordered for display. */
export async function getCourseOutline(id) {
  const data = unwrap(await requireClient()
    .from('courses')
    .select(`${COURSE_COLUMNS}, modules(id, title, position, unlock_after_module_id, activities(id, type, title, position, xp))`)
    .eq('id', id)
    .maybeSingle());
  if (!data) return null;
  return {
    ...courseToCamel(data),
    modules: (data.modules ?? [])
      .sort((a, b) => a.position - b.position)
      .map((m) => ({
        id: m.id,
        title: m.title,
        position: m.position,
        // Not a secret, and the trainee is the person who most needs it: the
        // server refuses a locked activity, so without this the only way to
        // discover a lock is to click into one and be turned away.
        unlockAfterModuleId: m.unlock_after_module_id ?? null,
        activities: (m.activities ?? [])
          .sort((a, b) => a.position - b.position)
          .map((a) => ({ id: a.id, type: a.type, title: a.title, position: a.position, xp: a.xp })),
      })),
  };
}

const slugify = (title) =>
  String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function createCourse({ title, subtitle, description, color, icon }) {
  const row = unwrap(await requireClient().from('courses')
    .insert({ slug: slugify(title), title, subtitle, description, color, icon })
    .select().single());
  return courseToCamel(row);
}

export async function updateCourse(id, patch) {
  const row = unwrap(await requireClient().from('courses')
    .update({
      title: patch.title, subtitle: patch.subtitle, description: patch.description,
      color: patch.color, icon: patch.icon,
    })
    .eq('id', id).select().single());
  return courseToCamel(row);
}

export async function deleteCourse(id) {
  unwrap(await requireClient().from('courses').delete().eq('id', id));
}

/** Status is never written directly; the Edge Function validates content first. */
export const publishCourse = (courseId, publish) =>
  invokeFn('publish-course', { courseId, publish });

/**
 * How much content each course actually has.
 *
 * publish-course refuses a course with zero activities (422). Without this the
 * Curriculum page can only discover that by pressing Publish and reading the
 * error, which makes a correct refusal look like a broken button.
 *
 * Counted through `courses` rather than `modules` so courses_select_admin is
 * the policy doing the work, and a course with no modules still appears.
 */
export async function courseContentCounts() {
  const rows = unwrap(await requireClient()
    .from('courses')
    .select('id, modules(id, activities(id))'));
  const counts = {};
  for (const c of rows ?? []) {
    const modules = c.modules ?? [];
    counts[c.id] = {
      modules: modules.length,
      activities: modules.reduce((n, m) => n + (m.activities?.length ?? 0), 0),
    };
  }
  return counts;
}
