import { requireClient } from './client';
import { unwrap, invokeFn } from './helpers';

/**
 * Maps an activity row and FLATTENS its content payload onto the object.
 *
 * The database keeps six activity shapes in one jsonb column, but the
 * components were written against flat props (activity.cards, activity.pairs,
 * activity.steps, activity.videoId). Spreading here keeps that contract, so
 * the components need no knowledge of how the payload is stored.
 *
 * The row's own fields are written AFTER the spread: content is authored data,
 * and a stray `id` or `type` key inside it must not be able to change which
 * activity this claims to be.
 */
export function activityToCamel(row) {
  if (!row) return null;
  const { id, module_id: moduleId, type, title, position, xp, content } = row;
  return { ...(content ?? {}), id, moduleId, type, title, position, xp };
}

const ACTIVITY_COLUMNS = 'id, module_id, type, title, position, xp, content';

export async function getActivity(id) {
  return activityToCamel(unwrap(
    await requireClient().from('activities').select(ACTIVITY_COLUMNS).eq('id', id).maybeSingle()
  ));
}

export async function listActivitiesForModule(moduleId) {
  const rows = unwrap(
    await requireClient().from('activities')
      .select(ACTIVITY_COLUMNS).eq('module_id', moduleId).order('position')
  );
  return (rows ?? []).map(activityToCamel);
}

/**
 * Records a completion. The Edge Function checks enrolment and module
 * prerequisites server-side; there is no client INSERT grant on
 * activity_completions, so this is the only route.
 */
export const completeActivity = (activityId, payload = {}) =>
  invokeFn('complete-activity', { activityId, payload });
