import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Icon from './Icon';
import { item } from '../../lib/motion';

/**
 * One headline number.
 *
 * Three variants of this existed — Metric, Stat and Figure — differing in
 * whether they took an icon, a subtitle or neither, and in whether the value
 * was a `div` or a `span`. Same card, three sizes of number.
 *
 * `value` is rendered as given, so a caller can pass an em dash for "not
 * measured yet". That distinction matters more than it looks: a dash and a
 * zero say very different things about a trainee.
 */

/**
 * Counts a number up to its value on arrival.
 *
 * Only for integers, and only from zero on first render — a figure that
 * animates every time it changes turns a background refetch into a distraction
 * on a page somebody is reading. Non-numeric values (an em dash, "67%") pass
 * straight through, which is why the check is on the parsed value rather than
 * on a prop the caller has to remember to set.
 */
function useCountUp(value, enabled) {
  const target = typeof value === 'number' && Number.isFinite(value) ? value : null;
  // null means "not animating" — the value renders as given. Keeping that
  // distinct from a real 0 is what lets the displayed figure be derived
  // during render rather than pushed into state by an effect.
  const [animated, setAnimated] = useState(null);
  const done = useRef(false);

  useEffect(() => {
    // Counting 0, 1, 2 draws more attention than the figure deserves, and a
    // number that re-animates on every background refetch is a distraction on
    // a page somebody is already reading — so this runs once, upward, and
    // only when there is enough distance to be worth watching.
    if (target === null || !enabled || done.current || Math.abs(target) < 5) return undefined;
    done.current = true;

    const duration = 620;
    const start = performance.now();
    let frame;

    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      // Quintic ease-out: fast at first, so the final value is legible for
      // most of the animation rather than racing at the end.
      setAnimated(Math.round(target * (1 - (1 - t) ** 5)));
      if (t < 1) frame = requestAnimationFrame(tick);
      else setAnimated(null);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);

  return animated ?? value;
}

export default function StatCard({ label, value, sub, icon, color, tone, animate = true }) {
  // useReducedMotion, not the media query: this is a JavaScript animation and
  // CSS cannot stop it. Somebody who has asked for less motion gets the final
  // figure immediately.
  const reduced = useReducedMotion();
  const shown = useCountUp(value, animate && !reduced);

  return (
    <motion.div
      className="stat-card"
      variants={item}
      style={color ? { '--stat-color': color } : undefined}
    >
      {icon && (
        <span className="stat-card-icon">
          <Icon name={icon} size={18} />
        </span>
      )}
      <div className="stat-card-value">{shown}</div>
      <div className="stat-card-label">{label}</div>
      {sub && (
        <div
          className="stat-card-sub"
          style={tone === 'attention' ? { color: 'var(--brand-accent)' } : undefined}
        >
          {sub}
        </div>
      )}
    </motion.div>
  );
}
