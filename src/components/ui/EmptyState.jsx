import { motion } from 'framer-motion';
import Icon from './Icon';
import { SPRING } from '../../lib/motion';

/**
 * "There is nothing here" said properly.
 *
 * An empty list and a failed request look identical when both render as blank
 * space, which is the mistake QueryError exists to prevent on the failure
 * side. This is the other half: nothing here, on purpose, and here is what to
 * do about it.
 *
 * `icon` takes an Icon name. It also still accepts a node — several callers
 * pass an emoji that belongs to their own subject matter — so the change of
 * icon system did not have to land in fourteen files at once.
 */
export default function EmptyState({ icon, title, children, action }) {
  return (
    <motion.div
      className="empty-state"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32 }}
    >
      {icon && (
        <motion.div
          className="empty-state-icon"
          aria-hidden="true"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...SPRING, delay: 0.06 }}
        >
          {typeof icon === 'string' && icon.length > 2
            ? <Icon name={icon} size={22} />
            : icon}
        </motion.div>
      )}
      {title && <p className="empty-state-title">{title}</p>}
      {children && <p className="empty-state-body">{children}</p>}
      {action && <div style={{ marginTop: '0.4rem' }}>{action}</div>}
    </motion.div>
  );
}
