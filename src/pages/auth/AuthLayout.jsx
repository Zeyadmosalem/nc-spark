import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Icon from '../../components/ui/Icon';
import { EASE_OUT, SPRING_SOFT } from '../../lib/motion';

/**
 * The frame all four signed-out screens sit in.
 *
 * They were a small card centred in an otherwise empty 2560px field — the
 * least confident thing in the product, on the one screen every user meets
 * before anything else, and the four of them had each written their own
 * heading, logo and spacing.
 *
 * The right-hand panel is not decoration. A visitor arriving at a compliance
 * training platform for the first time has no idea what it is, and the sign-in
 * form cannot tell them; the panel says what the thing does and what happens
 * after they sign up, which is the one question the pending-approval flow
 * makes urgent.
 *
 * It is `aria-hidden` and comes second in the DOM: on a screen reader the form
 * is the whole page, and the marketing copy is not something to make anyone
 * listen through before reaching the email field.
 */

const POINTS = [
  {
    icon: 'courses',
    title: 'Courses that track themselves',
    body: 'Progress is recorded as you go — no spreadsheets, no self-reporting.',
  },
  {
    icon: 'locked',
    title: 'Modules unlock in order',
    body: 'Prerequisites are enforced by the server, so nobody skips ahead.',
  },
  {
    icon: 'verified',
    title: 'Results you can evidence',
    body: 'Every completion and quiz attempt is kept against the person who earned it.',
  },
];

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth-shell">
      <motion.main
        className="auth-panel"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE_OUT }}
      >
        <div className="auth-form-wrap">
          <Link to="/login" className="auth-logo">
            <span className="auth-logo-mark" aria-hidden="true">NC</span>
            <span className="auth-logo-text">NC&nbsp;Spark</span>
          </Link>

          <div className="auth-head">
            <h1 className="auth-title">{title}</h1>
            {subtitle && <p className="auth-sub">{subtitle}</p>}
          </div>

          {children}

          {footer && <div className="auth-footer">{footer}</div>}
        </div>
      </motion.main>

      <aside className="auth-brand" aria-hidden="true">
        <motion.div
          className="auth-brand-inner"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={SPRING_SOFT}
        >
          <p className="auth-brand-eyebrow">Niagara College · Compliance training</p>
          <p className="auth-brand-lead">
            Everything a cohort has to complete, and proof that they did.
          </p>

          <ul className="auth-points">
            {POINTS.map((point, i) => (
              <motion.li
                key={point.title}
                className="auth-point"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22 + i * 0.09, duration: 0.45, ease: EASE_OUT }}
              >
                <span className="auth-point-icon">
                  <Icon name={point.icon} size={17} />
                </span>
                <span>
                  <strong>{point.title}</strong>
                  <span>{point.body}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </aside>
    </div>
  );
}
