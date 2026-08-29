/**
 * The chart palette, and why these exact values.
 *
 * Assigned in fixed order and never cycled: a series keeps its colour when a
 * filter removes its neighbours, so the eye can carry a meaning between two
 * charts on the same page.
 *
 * These three were chosen by running the palette validator rather than by
 * looking at them. What it rejected is the useful part:
 *
 *   - The brand navy (#002F6C) is outside the lightness band at 0.319 — too
 *     dark to sit on the light surface as a fill.
 *   - --brand-primary and --brand-secondary are two navies a few points apart,
 *     so they can never be a categorical pair whatever else is true.
 *   - The obvious "lift everything for dark mode" set failed outright: the
 *     lifted violet and blue came out ΔE 4.1 apart under deuteranopia and 13.4
 *     to normal vision, which is below the floor where full-colour readers can
 *     separate them.
 *
 * The steps below pass every check on BOTH surfaces — lightness band, chroma
 * floor, CVD separation (worst adjacent pair ΔE 9.6 deutan / 8.9 tritan),
 * normal-vision floor 17.1, and 3:1 contrast — so one palette serves light and
 * dark rather than a flip that has never been checked.
 *
 * Status colours (--warn/--danger/--success) are deliberately NOT here. They
 * mean a state, and reusing one as "series 3" makes a neutral category look
 * like a problem.
 */
export const SERIES = ['#1273B8', '#8B5CF6', '#0F8A6A'];

/** XP sources, in the order they are always drawn. */
export const KIND_COLOR = {
  activity: SERIES[0],
  quiz: SERIES[1],
  participation: SERIES[2],
};

/** A single-series chart uses the first hue; the title names what it is. */
export const PRIMARY = SERIES[0];
