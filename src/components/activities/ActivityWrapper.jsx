import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function ActivityWrapper({ activity, onComplete, onBack, isCompleted, children }) {
  const navigate = useNavigate();

  return (
    <div className="page-body" style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <button 
          className="btn btn-ghost btn-sm" 
          onClick={onBack || (() => navigate(-1))}
          style={{ padding: '0.5rem' }}
        >
          ← Back to Path
        </button>
        {activity && (
          <div className="badge-pill" style={{ background: 'var(--surface-alt)', color: 'var(--brand-primary)' }}>
            +{activity.xp} XP
          </div>
        )}
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card no-hover"
        style={{ padding: '2rem' }}
      >
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, background: 'rgba(0,47,108,0.08)', borderRadius: '50%', fontSize: '1.5rem', marginBottom: '1rem' }}>
            {activity?.type === 'video' && '▶️'}
            {activity?.type === 'reading' && '📖'}
            {activity?.type === 'flashcards' && '🗂️'}
            {activity?.type === 'matching' && '🧩'}
            {activity?.type === 'scenario' && '🕵️'}
          </div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', marginBottom: '0.5rem' }}>{activity?.title}</h1>
          <p style={{ color: 'var(--text-2)' }}>{activity?.description}</p>
        </div>

        <div className="activity-content-area" style={{ marginBottom: '2rem' }}>
          {children}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button 
            className="btn btn-primary" 
            onClick={onComplete}
            disabled={isCompleted}
          >
            {isCompleted ? '✓ Completed' : 'Mark as Complete'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
