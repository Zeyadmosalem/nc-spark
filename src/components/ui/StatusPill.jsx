/**
 * One pill for every status the app shows.
 *
 * There were four of these, inline-styled, in UserManager, ContentManager,
 * SupervisorCourses and TrainerCourses. They had already drifted: "Draft" and
 * "Pending" were meant to be the same amber and were not, and "Not passed"
 * and "Suspended" used two different reds.
 *
 * The vocabularies are the database enums — profile_status, course_status,
 * enrollment_status, attempt_status — so a status this does not know about is
 * a status the schema does not have. It still renders, in the neutral tone,
 * rather than disappearing: an unknown state is worth seeing.
 */

const TONE = {
  // profile_status
  active:         ['positive', 'Active'],
  pending:        ['warning',  'Pending'],
  suspended:      ['danger',   'Suspended'],
  rejected:       ['neutral',  'Rejected'],

  // course_status
  published:      ['positive', 'Published'],
  draft:          ['warning',  'Draft'],
  archived:       ['neutral',  'Archived'],

  // enrollment_status
  completed:      ['positive', 'Complete'],
  withdrawn:      ['neutral',  'Withdrawn'],

  // attempt_status
  passed:         ['positive', 'Passed'],
  failed:         ['danger',   'Not passed'],
  expired:        ['danger',   'Ran out of time'],
  pending_review: ['warning',  'Awaiting marking'],
  in_progress:    ['info',     'In progress'],

  // request_status
  approved:       ['positive', 'Approved'],
  denied:         ['neutral',  'Denied'],
};

/** Prettifies a status the table does not carry, rather than showing a blank. */
const fallbackLabel = (status) =>
  String(status).replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase());

export default function StatusPill({ status, label, tone }) {
  if (!status && !label) return null;
  const [knownTone, knownLabel] = TONE[status] ?? [];
  return (
    <span className={`pill pill-${tone ?? knownTone ?? 'neutral'}`}>
      {label ?? knownLabel ?? fallbackLabel(status)}
    </span>
  );
}
