import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../../context/AppContext';

export default function Sidebar({ navItems, footerExtra }) {
  const { currentUser, logout, pendingRequests, theme, toggleTheme } = useApp();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
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
              <span style={{ fontSize: '1rem' }}>{item.icon}</span>
              <span>{item.label}</span>
              {item.label === 'Pending Requests' && pendingRequests.length > 0 && (
                <span className="badge-dot">{pendingRequests.length}</span>
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
          <span style={{ fontSize: '1.25rem' }}>{theme === 'light' ? '🌙' : '☀️'}</span>
          <span style={{ marginLeft: '0.75rem' }}>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
        </button>
        {footerExtra}
        <div className="sidebar-user" onClick={handleLogout} title="Click to log out">
          <div className="avatar">{currentUser?.avatar || '?'}</div>
          <div className="sidebar-user-info">
            <strong>{currentUser?.name || 'User'}</strong>
            <span>{currentUser?.role} · Log out</span>
          </div>
        </div>
      </div>
    </motion.aside>
  );
}
