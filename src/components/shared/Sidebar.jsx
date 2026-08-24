import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/theme-context';
import { useSession } from '../../hooks/useSession';
import { signOut } from '../../api/auth';
import Icon from '../ui/Icon';
import { SPRING_SOFT, pop } from '../../lib/motion';

/**
 * The navigation rail.
 *
 * It is on screen on every route, so it carries more of the impression than
 * any single page. Three things changed here:
 *
 * - The icons were emoji. A house, a stack of books, a magnifying glass, each
 *   rendered in whatever the operating system supplies — so the rail looked
 *   different on Windows, macOS and Android, none of the glyphs matched the
 *   weight of the label beside them, and none could take the active colour.
 * - The active state was a background colour that blinked from one item to
 *   the next. It is now one element that slides, which is what makes the rail
 *   feel like a single control rather than eight independent ones.
 * - The footer's "log out" was hidden inside the user card. Somebody looking
 *   for their account settings clicked their own name and was signed out. The
 *   name now goes to the account page and log out is its own control.
 */

const ROLE_LABEL = {
  trainee: 'Trainee',
  trainer: 'Trainer',
  supervisor: 'Supervisor',
  admin: 'Administrator',
};

export default function Sidebar({ navItems, footerExtra }) {
  // Identity from the session, not from a context the prototype kept in sync
  // by hand. profile is the same row RLS authorises every request against.
  const { profile } = useSession();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  async function handleLogout() {
    // useSession picks up the auth change and App routes back to /login,
    // but navigating explicitly keeps the transition immediate.
    try {
      await signOut();
    } finally {
      navigate('/login');
    }
  }

  // Longest match wins, so /trainer/courses/:id/people highlights My Courses
  // rather than also matching the dashboard's "/trainer" prefix.
  const activePath = [...navItems]
    .filter((i) => i.to)
    .sort((a, b) => b.to.length - a.to.length)
    .find((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to)))?.to;

  const accountPath = navItems.find((i) => i.to?.endsWith('/account'))?.to;

  return (
    <motion.aside
      className="sidebar"
      initial={{ x: -16, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={SPRING_SOFT}
    >
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark" aria-hidden="true">NC</div>
        <div className="sidebar-logo-text">
          <strong>NC Spark</strong>
          <span>{ROLE_LABEL[profile?.role] ?? 'Portal'}</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Sections">
        {navItems.map((item) => (
          item.section ? (
            <div key={item.section} className="sidebar-section-label">{item.section}</div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              {/*
                One element with a layoutId, rendered only under the active
                item, so framer animates it between positions instead of
                cross-fading two backgrounds. It sits behind the label rather
                than around it — a background that animates its own size
                would squash the text while it moved.
              */}
              {activePath === item.to && (
                <motion.span
                  layoutId="sidebar-active"
                  className="sidebar-active-pill"
                  transition={SPRING_SOFT}
                />
              )}
              <span className="sidebar-link-content">
                <Icon name={item.icon} size={18} />
                <span className="sidebar-link-label">{item.label}</span>
                <AnimatePresence>
                  {item.badge > 0 && (
                    <motion.span
                      className="badge-dot"
                      variants={pop}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <span aria-hidden="true">{item.badge}</span>
                      {/* On its own the badge announces a bare number. */}
                      <span className="sr-only">{item.badge} waiting</span>
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </NavLink>
          )
        ))}
      </nav>

      <div className="sidebar-footer">
        {footerExtra}

        {/*
          The account link and the sign-out control are separate. As one
          element, the only thing a click on your own name could do was end
          your session — which is what people expected to be a way in to
          their settings.
        */}
        {accountPath ? (
          <NavLink to={accountPath} className="sidebar-user">
            <UserBadge profile={profile} />
          </NavLink>
        ) : (
          <div className="sidebar-user">
            <UserBadge profile={profile} />
          </div>
        )}

        {/*
          On its own row. Sharing one with the name left 77px for a name
          needing 89, so every account whose name was longer than about
          eleven characters was truncated in the one place it matters most.
        */}
        <div className="sidebar-utils">
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon sidebar-icon-btn"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            title={theme === 'light' ? 'Dark mode' : 'Light mode'}
          >
            {/*
              Keyed so the two glyphs cross-fade rather than swapping. The
              toggle is the one control in the rail whose effect is entirely
              visual, so it is worth the 150ms.
            */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                initial={{ opacity: 0, rotate: -35, scale: 0.7 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 35, scale: 0.7 }}
                transition={{ duration: 0.16 }}
                style={{ display: 'grid', placeItems: 'center' }}
              >
                <Icon name={theme === 'light' ? 'dark' : 'light'} size={16} />
              </motion.span>
            </AnimatePresence>
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon sidebar-icon-btn"
            onClick={handleLogout}
            aria-label="Log out"
            title="Log out"
          >
            <Icon name="logout" size={16} />
          </button>
        </div>
      </div>
    </motion.aside>
  );
}

function UserBadge({ profile }) {
  const name = profile?.name || 'User';
  return (
    <>
      <span className="avatar avatar-sm" aria-hidden="true">
        {profile?.avatar || name.charAt(0)}
      </span>
      <span className="sidebar-user-info">
        <strong>{name}</strong>
        <span>{ROLE_LABEL[profile?.role] ?? profile?.role}</span>
      </span>
    </>
  );
}
