import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import { BADGES } from '../../data/dummyData';
import Confetti from '../gamification/Confetti';

export default function NotificationToast() {
  const { notification } = useApp();

  return (
    <>
    <AnimatePresence>
      {notification && (
        <motion.div
          key="toast"
          className={`notification-toast ${notification.type}`}
          initial={{ opacity: 0, y: 40, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 9999 }}
        >
          {notification.type === 'xp' && (
            <>
              <span style={{ fontSize: '1.5rem' }}>⚡</span>
              <div>
                <strong style={{ display: 'block', color: 'var(--brand-purple)' }}>+{notification.amount} XP Earned!</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Keep going, you're on a roll!</span>
              </div>
            </>
          )}
          {notification.type === 'levelup' && (
            <>
              <span style={{ fontSize: '1.5rem' }}>🚀</span>
              <div>
                <strong style={{ display: 'block', color: 'var(--brand-purple)' }}>Level Up! +{notification.amount} XP</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>You are now {notification.newLevel}!</span>
              </div>
            </>
          )}
          {notification.type === 'badge' && (
            <>
              <span style={{ fontSize: '1.5rem' }}>{BADGES[notification.badgeId]?.icon || '🏅'}</span>
              <div>
                <strong style={{ display: 'block', color: '#b8860b' }}>Badge Unlocked!</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{BADGES[notification.badgeId]?.label}</span>
              </div>
            </>
          )}
          {notification.type === 'success' && (
            <>
              <span style={{ fontSize: '1.5rem' }}>✅</span>
              <div><strong style={{ display: 'block' }}>{notification.text}</strong></div>
            </>
          )}
          {notification.type === 'info' && (
            <>
              <span style={{ fontSize: '1.5rem' }}>ℹ️</span>
              <div><span style={{ fontSize: '0.9rem' }}>{notification.text}</span></div>
            </>
          )}
          {notification.type === 'milestone' && (
            <>
              <span style={{ fontSize: '1.5rem' }}>🎉</span>
              <div>
                <strong style={{ display: 'block', color: '#198754' }}>Milestone Reached!</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{notification.text}</span>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
    {notification && (notification.type === 'levelup' || notification.type === 'badge' || notification.type === 'milestone') && (
      <Confetti />
    )}
    </>
  );
}
