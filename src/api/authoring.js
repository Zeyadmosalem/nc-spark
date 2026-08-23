import { requireClient } from './client';
import { unwrap } from './helpers';

/**
 * Writing curriculum: modules and the activities inside them.
 *
 * No new grants and no Edge Function. `modules_write` and `activities_write`
 * are `for all` policies covering an admin or the owning trainer, and the
 * grants have been in place since M2 — the database has been ready for this
 * since the catalog milestone and nothing ever called it. That is why a course
 * created in the admin console could never be published: publish-course
 * refuses a course with zero activities, and there was no way to add one
 * outside `npm run db:seed-catalog`.
 *
 * Course status is NOT writable here. It is excluded from the column grant on
 * purpose so publishing has to go through publish-course, which checks the
 * course has content first.
 */

/**
 * The shape `activities_content_shape` requires, per type.
 *
 * Enforced by a CHECK constraint, so getting it wrong is a 400 rather than bad
 * data — but a 400 from a form the user just filled in is a poor way to learn
 * it. Kept here so the editor and the database agree in one place.
 */
export const CONTENT_KEY = {
  reading: 'body',
  video: 'videoId',
  flashcards: 'cards',
  matching: 'pairs',
  scenario: 'steps',
};

/** Types this editor can author. The rest need a structured editor of their own. */
export const AUTHORABLE_TYPES = ['reading', 'video', 'submission', 'quiz'];

export const EMPTY_CONTENT = {
  reading: { body: '' },
  video: { videoId: '' },
  submission: {},
  quiz: {},
};

const moduleToCamel = (r) => ({
  id: r.id,
  courseId: r.course_id,
  title: r.title,
  position: r.position,
  unlockAfterModuleId: r.unlock_after_module_id ?? null,
});

const activityToCamel = (r) => ({
  id: r.id,
  moduleId: r.module_id,
  type: r.type,
  title: r.title,
  position: r.position,
  xp: r.xp,
  content: r.content ?? {},
});

const MODULE_COLUMNS = 'id, course_id, title, position, unlock_after_module_id';
const ACTIVITY_COLUMNS = 'id, module_id, type, title, position, xp, content';

/**
 * The whole course, as the builder needs it.
 *
 * Deliberately not getCourseOutline. That one feeds the trainee course page
 * and omits `content` and `unlock_after_module_id`; adding them there would
 * ship every activity's content to every enrolled trainee, and scenario
 * content carries `isCorrect` (backlog B3). The editor needs both, and only
 * an admin or the owning trainer can reach this — same policies as the writes.
 */
export async function getCourseForEditing(courseId) {
  const data = unwrap(await requireClient()
    .from('courses')
    .select(`
      id, title, subtitle, status, icon, color, trainer_id,
      modules(${MODULE_COLUMNS}, activities(${ACTIVITY_COLUMNS}))
    `)
    .eq('id', courseId)
    .maybeSingle());
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    subtitle: data.subtitle,
    status: data.status,
    icon: data.icon,
    color: data.color,
    trainerId: data.trainer_id,
    modules: (data.modules ?? [])
      .sort((a, b) => a.position - b.position)
      .map((m) => ({
        ...moduleToCamel(m),
        activities: (m.activities ?? [])
          .sort((a, b) => a.position - b.position)
          .map(activityToCamel),
      })),
  };
}

/**
 * `position` is UNIQUE per course, and nothing in the schema assigns it. The
 * caller passes the next one because only the caller knows what it already has
 * on screen; a read-then-write here would race with itself on a double click
 * and produce a duplicate-key error instead of a queue.
 */
export async function createModule({ courseId, title, position, unlockAfterModuleId = null }) {
  const row = unwrap(await requireClient().from('modules')
    .insert({
      course_id: courseId,
      title,
      position,
      unlock_after_module_id: unlockAfterModuleId,
    })
    .select(MODULE_COLUMNS).single());
  return moduleToCamel(row);
}

export async function updateModule(id, { title, unlockAfterModuleId }) {
  const patch = {};
  if (title !== undefined) patch.title = title;
  // Explicitly distinguishable from "leave it alone": null clears the gate.
  if (unlockAfterModuleId !== undefined) patch.unlock_after_module_id = unlockAfterModuleId;
  const row = unwrap(await requireClient().from('modules')
    .update(patch).eq('id', id).select(MODULE_COLUMNS).single());
  return moduleToCamel(row);
}

/** Cascades to the activities inside it, and to their completions. */
export async function deleteModule(id) {
  unwrap(await requireClient().from('modules').delete().eq('id', id));
}

export async function createActivity({ moduleId, type, title, position, xp = 10, content }) {
  const row = unwrap(await requireClient().from('activities')
    .insert({
      module_id: moduleId,
      type,
      title,
      position,
      xp,
      content: content ?? EMPTY_CONTENT[type] ?? {},
    })
    .select(ACTIVITY_COLUMNS).single());
  return activityToCamel(row);
}

export async function updateActivity(id, { title, xp, content }) {
  const patch = {};
  if (title !== undefined) patch.title = title;
  if (xp !== undefined) patch.xp = xp;
  if (content !== undefined) patch.content = content;
  const row = unwrap(await requireClient().from('activities')
    .update(patch).eq('id', id).select(ACTIVITY_COLUMNS).single());
  return activityToCamel(row);
}

export async function deleteActivity(id) {
  unwrap(await requireClient().from('activities').delete().eq('id', id));
}
