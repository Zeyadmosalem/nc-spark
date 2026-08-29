/**
 * Two things the app displays in a dozen places and had written out at each of
 * them: a date, and the letter that stands in for a missing avatar.
 *
 * Neither is complicated. What made them worth collecting is that the copies
 * had drifted: two of the six date formatters had lost the invalid-date guard,
 * and two of the six initial helpers indexed into `name` without a fallback.
 * None of those was reachable today — every one happened to be called with
 * good data — which is precisely why nobody noticed them going out of step.
 */

/**
 * A date as a person reads it, in their own locale.
 *
 * Returns '' rather than the string "Invalid Date" for anything unparseable,
 * because an empty cell reads as "not known" and "Invalid Date" reads as a
 * bug in front of a user.
 *
 * @param {string} iso
 * @param {{month?: 'short'|'long', year?: boolean}} [options]
 */
export function formatDate(iso, { month = 'short', year = true } = {}) {
  // Checked before parsing, because new Date(null) is not an invalid date —
  // it is the epoch. Every copy of this guarded NaN alone, so a null
  // timestamp rendered "Jan 1, 1970" rather than nothing.
  if (typeof iso !== 'string' || iso === '') return '';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month,
    ...(year ? { year: 'numeric' } : {}),
  });
}

/**
 * The one or two characters shown in an avatar circle.
 *
 * A chosen avatar wins; otherwise the first letter of the name. The '?'
 * fallback matters because public_profiles returns a null name for a
 * deactivated account, and `null.charAt` is a blank screen rather than a
 * missing letter.
 *
 * @param {{avatar?: string|null, name?: string|null}} person
 */
export function initialOf(person) {
  return person?.avatar || (person?.name ?? '?').charAt(0).toUpperCase();
}
