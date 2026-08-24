import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Icon from './Icon';
import { fadeUp } from '../../lib/motion';

/**
 * The top of every page.
 *
 * Fourteen screens opened with the same three elements — an eyebrow, a title,
 * a subtitle — written out longhand each time, with `marginBottom: '0.35rem'`
 * on some titles and not others, and the back link sometimes above the eyebrow
 * and sometimes below it. Small inconsistencies in the one element that
 * appears on every screen are what the eye reads as carelessness.
 *
 * `actions` sits on the baseline of the title rather than above it, so a page
 * with a primary action and one without have the same first line.
 */
export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  backTo,
  backLabel = 'Back',
  icon,
}) {
  return (
    <motion.div
      className="stack"
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      custom={0}
    >
      {backTo && (
        <Link to={backTo} className="crumb">
          <Icon name="back" size={14} />
          {backLabel}
        </Link>
      )}

      <div className="page-head">
        <div className="page-head-text">
          {eyebrow && (
            <p className="eyebrow">
              {icon && <Icon name={icon} size={13} />}
              {eyebrow}
            </p>
          )}
          {/*
            h1 unconditionally. RoleShell provides the main landmark and the
            document title, but the page still needs exactly one top-level
            heading for a screen reader's heading list to be navigable.
          */}
          {title && <h1 className="section-heading">{title}</h1>}
          {subtitle && <p className="section-sub">{subtitle}</p>}
        </div>
        {actions && <div className="page-head-actions">{actions}</div>}
      </div>
    </motion.div>
  );
}
