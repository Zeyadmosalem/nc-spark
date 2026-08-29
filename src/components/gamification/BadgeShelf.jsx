import { motion } from 'framer-motion';
import Icon from '../ui/Icon';

/**
 * Every badge, earned and unearned together.
 *
 * The unearned ones are shown deliberately rather than hidden: a shelf of only
 * what you already have says nothing about what to do next, and the whole
 * point of a badge is that it is visible before it is yours. They are dimmed
 * and marked "Not yet", never disguised as earned.
 */
export default function BadgeShelf({ catalog, earned }) {
  if (!catalog || catalog.length === 0) return null;

  const onDate = (iso) => new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <ul className="badge-shelf">
      {catalog.map((badge, i) => {
        const at = earned?.get(badge.code);
        const has = Boolean(at);
        return (
          <motion.li
            key={badge.code}
            className={`badge-tile${has ? ' is-earned' : ''}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.3) }}
          >
            <span className="badge-tile-icon" aria-hidden="true">
              <Icon name={badge.icon} size={20} />
            </span>
            <span className="badge-tile-name">{badge.name}</span>
            <span className="badge-tile-desc">{badge.description}</span>
            {/* Status in words, not colour alone. */}
            <span className="badge-tile-state">
              {has ? `Earned ${onDate(at)}` : 'Not yet'}
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}
