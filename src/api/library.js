import { requireClient } from './client';
import { unwrap } from './helpers';
import { myEnrollments } from './enrollments';
import { moduleLockState } from './progress';

/**
 * Everything the caller can open, across every course they are on.
 *
 * The prototype had two screens for this — a quiz list and a video library —
 * both reading invented data, and both were deleted with the prototype store.
 * Their purpose was real: a trainee taking four courses had no way to answer
 * "what videos are there" or "which quizzes are left" without opening each
 * course and scrolling its modules.
 *
 * One query for the activities rather than one outline per course, so a
 * trainee on ten courses costs the same three round trips as a trainee on one.
 * `modules!inner` is what makes the course filter reach through the join;
 * activities_select still scopes every row to a course the caller is enrolled
 * on, so this cannot return anything the course page would not.
 */

const ACTIVITY_SELECT = `
  id, type, title, position,
  modules!inner(id, title, position, course_id, unlock_after_module_id)
`;

export async function myLibrary() {
  const client = requireClient();

  const enrollments = (await myEnrollments())
    .filter((e) => e.status === 'active' || e.status === 'completed');

  // Nothing enrolled. Two `in ()` queries to be told so is two round trips
  // more than the answer needs.
  if (enrollments.length === 0) return [];

  const courseIds = enrollments.map((e) => e.courseId);
  const enrollmentIds = enrollments.map((e) => e.id);

  const [rows, courses, completions] = await Promise.all([
    client.from('activities').select(ACTIVITY_SELECT)
      .in('modules.course_id', courseIds).then(unwrap),
    client.from('courses').select('id, title, icon, color')
      .in('id', courseIds).then(unwrap),
    client.from('activity_completions').select('enrollment_id, activity_id')
      .in('enrollment_id', enrollmentIds).then(unwrap),
  ]);

  const courseById = new Map((courses ?? []).map((c) => [c.id, c]));
  const enrollmentByCourse = new Map(enrollments.map((e) => [e.courseId, e]));

  // Completions are per enrolment, and lock state is computed per course, so
  // both are keyed by course before anything is assembled.
  const doneByCourse = new Map();
  for (const c of completions ?? []) {
    const enrollment = enrollments.find((e) => e.id === c.enrollment_id);
    if (!enrollment) continue;
    if (!doneByCourse.has(enrollment.courseId)) doneByCourse.set(enrollment.courseId, new Set());
    doneByCourse.get(enrollment.courseId).add(c.activity_id);
  }

  // moduleLockState needs whole modules with their activities, which is not
  // how the rows arrive. Rebuilding them here rather than fetching outlines
  // separately keeps the one-query shape and reuses the rule verbatim, so the
  // library and the course page can never disagree about a padlock.
  const modulesByCourse = new Map();
  for (const row of rows ?? []) {
    const m = row.modules;
    if (!modulesByCourse.has(m.course_id)) modulesByCourse.set(m.course_id, new Map());
    const byId = modulesByCourse.get(m.course_id);
    if (!byId.has(m.id)) {
      byId.set(m.id, {
        id: m.id,
        title: m.title,
        position: m.position,
        unlockAfterModuleId: m.unlock_after_module_id ?? null,
        activities: [],
      });
    }
    byId.get(m.id).activities.push({ id: row.id });
  }

  const locksByCourse = new Map();
  for (const [courseId, byId] of modulesByCourse) {
    locksByCourse.set(courseId,
      moduleLockState([...byId.values()], doneByCourse.get(courseId) ?? new Set()));
  }

  return (rows ?? []).map((row) => {
    const m = row.modules;
    const course = courseById.get(m.course_id);
    const lock = locksByCourse.get(m.course_id)?.get(m.id);
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      position: row.position,
      moduleId: m.id,
      moduleTitle: m.title,
      modulePosition: m.position,
      courseId: m.course_id,
      courseTitle: course?.title ?? 'A course',
      courseIcon: course?.icon ?? null,
      courseColor: course?.color ?? null,
      enrollmentId: enrollmentByCourse.get(m.course_id)?.id ?? null,
      completed: (doneByCourse.get(m.course_id) ?? new Set()).has(row.id),
      unlocked: lock ? lock.unlocked : true,
      blockedBy: lock?.blockedBy ?? null,
    };
  }).sort((a, b) => (
    a.courseTitle.localeCompare(b.courseTitle)
    || a.modulePosition - b.modulePosition
    || a.position - b.position
  ));
}
