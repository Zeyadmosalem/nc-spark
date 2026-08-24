/**
 * One motion vocabulary for the whole app.
 *
 * Six screens had each written their own `fadeUp` — 18px here, 20px there,
 * 0.07s stagger on one page and 0.06s on the next, three different easing
 * curves. None of it was wrong individually, and together it is exactly what
 * makes an interface feel assembled rather than designed: the same gesture
 * arriving slightly differently depending on which page you happen to be on.
 *
 * The rules these encode:
 *
 * - Distance scales with the element. A card travels further than a row,
 *   because a small element moving a long way reads as flying in.
 * - Entrances decelerate, exits accelerate. Something arriving should settle;
 *   something leaving should get out of the way.
 * - Stagger is capped. A list of forty rows animating at 40ms each takes 1.6
 *   seconds before the last one appears, which is no longer an animation, it
 *   is a wait.
 * - Nothing important is gated behind an animation. Every variant here starts
 *   from an opacity and a transform, so with animation disabled the element is
 *   simply there.
 *
 * MotionConfig reducedMotion="user" in App.jsx neutralises the transforms for
 * anyone who has asked for reduced motion; framer writes inline styles from
 * JavaScript and never reads the CSS media query, so both are needed.
 */

/* Curves matched to the CSS custom properties in foundation.css, so a CSS
   transition and a framer animation on the same element agree. */
export const EASE = [0.32, 0.72, 0, 1];
export const EASE_OUT = [0.16, 1, 0.3, 1];
export const EASE_IN = [0.5, 0, 0.75, 0];

/** For anything the user directly caused — it earns a little overshoot. */
export const SPRING = { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 };

/** For layout shifts, where overshoot would look like a glitch. */
export const SPRING_SOFT = { type: 'spring', stiffness: 260, damping: 32 };

/* --------------------------------------------------------------- entrances */

/**
 * The workhorse. `custom` is the index in a sequence.
 *
 * The stagger is applied here rather than through staggerChildren so a page
 * can hand an index to elements that are not literal siblings — a heading, a
 * stat row and a card do not share a parent but should still cascade.
 */
export const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      // Capped: past about eight elements the cascade stops reading as one
      // gesture and starts reading as latency.
      delay: Math.min(i, 8) * 0.05,
      duration: 0.42,
      ease: EASE_OUT,
    },
  }),
  exit: { opacity: 0, y: -8, transition: { duration: 0.18, ease: EASE_IN } },
};

/** Smaller travel, for rows inside an already-visible container. */
export const fadeIn = {
  hidden: { opacity: 0, y: 6 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: Math.min(i, 12) * 0.028, duration: 0.3, ease: EASE_OUT },
  }),
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/** For something appearing at a point — a popover, a toast, a badge. */
export const pop = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1, transition: SPRING },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.14, ease: EASE_IN } },
};

/* ----------------------------------------------------------- orchestration */

/**
 * A parent that cascades its children. Use with `item` on each child.
 *
 * delayChildren gives the container itself a beat to arrive first, so the
 * children look like they belong to it rather than racing it.
 */
export const stagger = (step = 0.045, delay = 0.04) => ({
  hidden: {},
  visible: { transition: { staggerChildren: step, delayChildren: delay } },
});

export const item = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.38, ease: EASE_OUT } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.16, ease: EASE_IN } },
};

/* ------------------------------------------------------------- transitions */

/**
 * Between routes inside a shell.
 *
 * Deliberately small and quick. A page transition is a courtesy, not a
 * feature: anything longer than about 200ms is time the user spends waiting
 * to read something they already asked for.
 */
export const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.26, ease: EASE_OUT } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.14, ease: EASE_IN } },
};

/** For a panel that expands in place — module contents, a detail row. */
export const collapse = {
  hidden: { opacity: 0, height: 0 },
  visible: {
    opacity: 1,
    height: 'auto',
    transition: { height: { duration: 0.3, ease: EASE_OUT }, opacity: { duration: 0.22, delay: 0.06 } },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: { height: { duration: 0.22, ease: EASE_IN }, opacity: { duration: 0.12 } },
  },
};

/* ------------------------------------------------------ micro-interactions */

/**
 * Hover and press for something clickable.
 *
 * The press is larger than the lift, and faster. That asymmetry is what makes
 * a control feel physical: pushing something down is a harder, more immediate
 * motion than it drifting up under a cursor.
 */
export const liftable = {
  whileHover: { y: -2, transition: { duration: 0.18, ease: EASE_OUT } },
  whileTap: { scale: 0.985, y: 0, transition: { duration: 0.08 } },
};

export const pressable = {
  whileHover: { scale: 1.015, transition: { duration: 0.16, ease: EASE_OUT } },
  whileTap: { scale: 0.97, transition: { duration: 0.08 } },
};

/** A row in a list: a nudge rather than a lift, so the list stays a list. */
export const nudge = {
  whileHover: { x: 3, transition: { duration: 0.18, ease: EASE_OUT } },
};
