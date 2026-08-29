import { describe, it, expect } from 'vitest';
import { formatDate, initialOf } from './format';

describe('formatDate', () => {
  it('writes a date the way the screens did', () => {
    // Locale-dependent by design, so this asserts the parts rather than a
    // string: the point is that day, month and year are all present.
    const out = formatDate('2026-03-09T10:00:00Z');
    expect(out).toMatch(/9/);
    expect(out).toMatch(/Mar/i);
    expect(out).toMatch(/2026/);
  });

  it('drops the year when asked, for the compact chart and inbox labels', () => {
    const out = formatDate('2026-03-09T10:00:00Z', { year: false });
    expect(out).toMatch(/Mar/i);
    expect(out).not.toMatch(/2026/);
  });

  it('spells the month out for the account page', () => {
    expect(formatDate('2026-03-09T10:00:00Z', { month: 'long' })).toMatch(/March/i);
  });

  /**
   * The guard two of the six copies had lost. "Invalid Date" in a table cell
   * reads as a bug to the person looking at it; an empty cell reads as
   * "not known", which is what it means.
   */
  it('gives nothing back for a date it cannot read', () => {
    expect(formatDate('not a date')).toBe('');
    // new Date(null) is the EPOCH, not an invalid date, so this one needs a
    // check before parsing. Every copy guarded NaN alone and would have
    // rendered "Jan 1, 1970" for a null timestamp.
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });
});

describe('initialOf', () => {
  it('prefers a chosen avatar', () => {
    expect(initialOf({ avatar: 'ZM', name: 'Alice Ahmed' })).toBe('ZM');
  });

  it('falls back to the first letter of the name, capitalised', () => {
    expect(initialOf({ avatar: null, name: 'alice ahmed' })).toBe('A');
  });

  /**
   * public_profiles returns a null name for a deactivated account, and the
   * two copies that indexed straight into it would have thrown — a blank
   * screen rather than a missing letter.
   */
  it('survives a person with no name at all', () => {
    expect(initialOf({ avatar: null, name: null })).toBe('?');
    expect(initialOf({})).toBe('?');
    expect(initialOf(undefined)).toBe('?');
  });
});
