import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import { signOut } from '../../api/auth';

export default function Sidebar({ navItems, footerExtra }) {
  const { currentUser, pendingRequests, theme, toggleTheme } = useApp();
  const navigate = useNavigate();

  async function handleLogout() {
    // useSession picks up the auth change and App routes back to /login,
    // but navigating explicitly keeps the transition immediate.
    try {
      await signOut();
    } finally {
      navigate('/login');
    }
  }

  return (
    <motion.aside
      className="sidebar"
      initial={{ x: -240 }}
      animate={{ x: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">NCS</div>
        <div className="sidebar-logo-text">
          <strong>NC Spark</strong>
          <span>{currentUser?.role || 'Portal'}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
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
              <span style={{ fontSize: '1rem' }} aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {/* A nav item can carry its own count. The Pending Requests
                  fallback is the prototype's hardcoded behaviour, kept so the
                  admin nav keeps working until it supplies a badge itself. */}
              {(item.badge ?? (item.label === 'Pending Requests' ? pendingRequests.length : 0)) > 0 && (
                <span className="badge-dot">
                  <span aria-hidden="true">{item.badge ?? pendingRequests.length}</span>
                  {/* On its own the badge announces a bare number. */}
                  <span className="sr-only">
                    {item.badge ?? pendingRequests.length} waiting
                  </span>
                </span>
              )}
            </NavLink>
          )
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <button 
          onClick={toggleTheme} 
          className="btn btn-ghost btn-sm" 
          style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--sidebar-text)', marginBottom: '0.5rem', padding: '0.5rem' }}
        >
          <span style={{ fontSize: '1.25rem' }} aria-hidden="true">
            {theme === 'light' ? '🌙' : '☀️'}
          </span>
          <span style={{ marginLeft: '0.75rem' }}>
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </span>
        </button>
        {footerExtra}
        {/*
          A button, not a div with onClick. As a div this was unreachable by
          keyboard and announced as nothing, which meant a keyboard-only user
          had no way to log out at all — the only exit from the app.
        */}
        <button
          type="button"
          className="sidebar-user"
          onClick={handleLogout}
        >
          <div className="avatar" aria-hidden="true">{currentUser?.avatar || '?'}</div>
          <div className="sidebar-user-info">
            <strong>{currentUser?.name || 'User'}</strong>
            <span>{currentUser?.role} · Log out</span>
          </div>
        </button>
      </div>
    </motion.aside>
  );
}
